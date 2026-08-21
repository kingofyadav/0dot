import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getFeed, likePost, repostPost, toggleBookmark, ApiError } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { PostRow } from "../../src/components/PostRow";
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

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);

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
    haptics.light();
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
    haptics.light();
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
    haptics.light();
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
          style={styles.screen}
          contentContainerStyle={posts.length === 0 ? styles.grow : undefined}
          data={posts}
          keyExtractor={(post) => post.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={offlineCachedAt ? <OfflineBanner cachedAt={offlineCachedAt} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={error ? "cloud-offline-outline" : "newspaper-outline"}
              message={error ?? "Nothing in your feed yet. Follow people on 0dot to see their posts here."}
              onRetry={error ? loadFirstPage : undefined}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
          renderItem={({ item }) => (
            <PostRow
              post={item}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
              onToggleLike={() => onToggleLike(item)}
              onToggleRepost={() => onToggleRepost(item.id)}
              onToggleBookmark={() => onToggleBookmark(item)}
            />
          )}
        />
        <Pressable
          onPress={() => router.push("/compose")}
          accessibilityRole="button"
          accessibilityLabel="New post"
          style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="add" size={26} color={theme.colors.onAccent} />
        </Pressable>
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
    fab: {
      position: "absolute",
      right: theme.space[5],
      bottom: theme.space[5],
      width: 56,
      height: 56,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
