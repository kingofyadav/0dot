import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { getBookmarks, likePost, repostPost, toggleBookmark, ApiError } from "../src/api/client";
import { EmptyState } from "../src/components/EmptyState";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { PostActionsSheet } from "../src/components/PostActionsSheet";
import { PostRow } from "../src/components/PostRow";
import { ReplySheet } from "../src/components/ReplySheet";
import { FeedRowSkeleton } from "../src/components/Skeleton";
import { animateNextLayout } from "../src/utils/animateLayout";
import { haptics } from "../src/utils/haptics";
import { getCached, setCached } from "../src/utils/offlineCache";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { Post } from "../src/api/types";

const CACHE_KEY = "bookmarks";

// Same read-time-offline-cache / optimistic-toggle / cursor-pagination
// recipe the feed screen and ProfileScreenBody already establish — see
// index.tsx's own comments for why (Phase 15 spec §5.2: live fetch always
// wins, cache is only a failure fallback).
export default function BookmarksScreen() {
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

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { items, nextCursor: cursor } = await getBookmarks();
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
        setError(err instanceof ApiError ? err.message : "Could not load your bookmarks.");
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await loadFirstPage();
        animateNextLayout();
        setLoading(false);
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
      const { items, nextCursor: cursor } = await getBookmarks(nextCursor);
      animateNextLayout();
      setPosts((prev) => [...prev, ...items]);
      setNextCursor(cursor);
    } catch {
      // Best-effort, same posture as the feed's own onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

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

  async function onToggleRepost(postId: string) {
    try {
      const result = await repostPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repostCount: result.repostCount } : p)));
    } catch {
      haptics.warning();
    }
  }

  // Unbookmarking here removes the post from the list entirely rather than
  // leaving an unbookmarked row behind — this screen's whole reason to
  // exist is "posts I bookmarked," so a post that's no longer bookmarked
  // doesn't belong on it, unlike the feed's PostRow where the bookmark
  // toggle is just one more stat among many on a post you're still
  // viewing for other reasons.
  async function onToggleBookmark(post: Post) {
    animateNextLayout();
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    try {
      const result = await toggleBookmark(post.id);
      if (result.bookmarked) {
        // Toggled back on by the same tap that toggled it off (only
        // possible via a very fast double-tap) — put it back rather than
        // leaving the server and screen state disagreeing.
        animateNextLayout();
        setPosts((prev) => [post, ...prev]);
      }
    } catch {
      haptics.warning();
      animateNextLayout();
      setPosts((prev) => [post, ...prev]);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        {[0, 1, 2, 3].map((i) => (
          <FeedRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
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
            icon={error ? "cloud-offline-outline" : "bookmark-outline"}
            message={error ?? "Nothing bookmarked yet. Tap the bookmark icon on any post to save it here."}
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
            onReply={() => setReplyTarget(item)}
            onLongPress={() => setActionsTarget(item)}
          />
        )}
      />
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
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    grow: { flexGrow: 1 },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
