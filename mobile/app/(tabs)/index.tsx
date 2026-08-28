import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { getFeed, likePost, repostPost, toggleBookmark, ApiError } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { FAB } from "../../src/components/FAB";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { PostActionsSheet } from "../../src/components/PostActionsSheet";
import { PostRow } from "../../src/components/PostRow";
import { ReplySheet } from "../../src/components/ReplySheet";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { getCached, setCached } from "../../src/utils/offlineCache";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { Post } from "../../src/api/types";

const CACHE_KEY = "feed";

export default function HomeScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { me } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Post | null>(null);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const listRef = useRef<FlatList<Post>>(null);
  const newestPostId = useRef<string | null>(null);

  // Phase 15 spec §5.2: read-time offline caching. A live fetch always
  // wins and refreshes the cache; the cache is only ever consulted after a
  // live fetch has already failed, never as a first choice.
  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { items, nextCursor: cursor } = await getFeed();
      setPosts(items);
      setNextCursor(cursor);
      setOfflineCachedAt(null);
      setCached(CACHE_KEY, items);
      newestPostId.current = items[0]?.id ?? null;
      setHasNewPosts(false);
    } catch (err) {
      const cached = await getCached<Post[]>(CACHE_KEY);
      if (cached && cached.value.length > 0) {
        setPosts(cached.value);
        setNextCursor(null);
        setOfflineCachedAt(cached.cachedAt);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load your feed.");
      }
    }
  }, []);

  // useFocusEffect (not a plain mount useEffect) so returning to this tab
  // after posting from the compose screen shows the new post without a
  // manual pull-to-refresh — expo-router keeps tab screens mounted across
  // switches, so a mount-only effect would never fire again. isFirstLoad
  // keeps the full skeleton screen exclusive to the very first load; every
  // later focus is a quiet background refresh instead.
  const isFirstLoad = useRef(true);
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (isFirstLoad.current) {
          setLoading(true);
          await loadFirstPage();
          animateNextLayout();
          setLoading(false);
          isFirstLoad.current = false;
        } else {
          await loadFirstPage();
          animateNextLayout();
        }
      })();
    }, [loadFirstPage])
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await loadFirstPage();
    setRefreshing(false);
  }

  // Mobile pro-upgrade addendum, sub-phase M13 — a "new posts" pill
  // instead of silently doing nothing until a manual pull-to-refresh.
  // Cheap existence check only (no state mutation beyond the pill itself)
  // so it never disrupts scroll position; the pill tap is what actually
  // reloads. 30s cadence while this tab is focused, same order-of-
  // magnitude poll messages.tsx used pre-M10 before that screen had a
  // push-driven stream to replace it — the feed has no equivalent stream.
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(async () => {
        try {
          const { items } = await getFeed();
          const latest = items[0];
          if (latest && latest.id !== newestPostId.current) setHasNewPosts(true);
        } catch {
          // Best-effort — a failed background check just means the pill
          // doesn't appear this cycle; the next interval tries again.
        }
      }, 30_000);
      return () => clearInterval(interval);
    }, [])
  );

  async function onNewPostsPress() {
    haptics.light();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    await loadFirstPage();
  }

  async function onEndReached() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items, nextCursor: cursor } = await getFeed(nextCursor);
      animateNextLayout();
      setPosts((prev) => [...prev, ...items]);
      setNextCursor(cursor);
    } catch {
      // Best-effort — a failed "load more" shouldn't clear what's already
      // showing; the user can pull-to-refresh or scroll again to retry.
    } finally {
      setLoadingMore(false);
    }
  }

  // Optimistic: isLiked/likeCount from the last GET is known, so the
  // direction of the toggle is never a guess — rolled back to the
  // pre-tap snapshot on failure rather than left in a state the server
  // never actually confirmed.
  async function onToggleLike(post: Post) {
    const { isLiked, likeCount } = post;
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, isLiked: !isLiked, likeCount: likeCount + (isLiked ? -1 : 1) } : p))
    );
    try {
      const result = await likePost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked: result.liked, likeCount: result.likeCount } : p)));
    } catch {
      haptics.warning();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked, likeCount } : p)));
    }
  }

  // Not optimistic — unlike likes, a GET never tells this screen whether
  // the viewer already reposted (the web app itself has no viewer-relative
  // repost indicator either, see PostCard.tsx), so there's no known
  // direction to pre-apply. Waits for the server's own before/after count.
  async function onToggleRepost(postId: string) {
    try {
      const result = await repostPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repostCount: result.repostCount } : p)));
    } catch {
      haptics.warning();
    }
  }

  // Optimistic, same known-direction posture as onToggleLike (the current
  // state is always known from the last GET).
  async function onToggleBookmark(post: Post) {
    const { isBookmarked } = post;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked: !isBookmarked } : p)));
    try {
      const result = await toggleBookmark(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked: result.bookmarked } : p)));
    } catch {
      haptics.warning();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked } : p)));
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        {[0, 1, 2, 3, 4].map((i) => (
          <FeedRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {/* maxWidth/alignSelf live on this wrapper (not the FlatList itself)
          so the FAB below — absolutely positioned within it — anchors to
          the centered content column's own edge on a tablet, not the full
          window width behind it. */}
      <View style={[styles.contentWrap, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
        <FlatList
          ref={listRef}
          style={styles.screen}
          contentContainerStyle={posts.length === 0 ? styles.grow : undefined}
          data={posts}
          keyExtractor={(post) => post.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={offlineCachedAt ? <OfflineBanner cachedAt={offlineCachedAt} /> : null}
          ListEmptyComponent={
            error ? (
              <EmptyState icon="cloud-offline-outline" message={error} onRetry={loadFirstPage} />
            ) : (
              <EmptyState
                icon="newspaper-outline"
                title="Your feed is quiet"
                description="Follow a few people on 0dot and their posts will show up here."
              />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
          renderItem={({ item }) => (
            <PostRow
              post={item}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
              onToggleLike={() => onToggleLike(item)}
              onToggleRepost={() => onToggleRepost(item.id)}
              onToggleBookmark={() => onToggleBookmark(item)}
              onReply={() => setReplyTarget(item)}
              onLongPress={() => setActionsTarget(item)}
            />
          )}
        />
        <FAB icon="add" accessibilityLabel="New post" onPress={() => router.push("/compose")} />
        {hasNewPosts ? (
          <Pressable
            onPress={onNewPostsPress}
            accessibilityRole="button"
            accessibilityLabel="Show new posts"
            style={[styles.newPostsPill, theme.shadow.sm]}
          >
            <Ionicons name="arrow-up" size={14} color={theme.colors.onAccent} />
            <Text style={styles.newPostsPillText}>New posts</Text>
          </Pressable>
        ) : null}
        <ReplySheet
          post={replyTarget}
          onClose={() => setReplyTarget(null)}
          onReplied={() => {
            const repliedId = replyTarget?.id;
            setPosts((prev) => prev.map((p) => (p.id === repliedId ? { ...p, replyCount: p.replyCount + 1 } : p)));
          }}
        />
        <PostActionsSheet
          post={actionsTarget}
          isOwnPost={actionsTarget !== null && actionsTarget.author === me?.username}
          onClose={() => setActionsTarget(null)}
          onDeleted={() => {
            const deletedId = actionsTarget?.id;
            setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          }}
        />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    contentWrap: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.colors.background },
    grow: { flexGrow: 1 },
    footerSpinner: { paddingVertical: theme.space[4] },
    newPostsPill: {
      position: "absolute",
      top: theme.space[3],
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[1],
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[2],
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
    },
    newPostsPillText: { color: theme.colors.onAccent, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
  });
}
