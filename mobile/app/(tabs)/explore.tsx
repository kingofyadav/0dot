import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { searchUsers, searchPosts, likePost, repostPost, toggleBookmark, ApiError } from "../../src/api/client";
import { DiscoverHub } from "../../src/components/DiscoverHub";
import { EmptyState } from "../../src/components/EmptyState";
import { PostRow } from "../../src/components/PostRow";
import { UserRow } from "../../src/components/UserRow";
import { SearchBar } from "../../src/components/SearchBar";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { Post, SearchUser } from "../../src/api/types";

type Tab = "users" | "posts";
const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "People" },
  { key: "posts", label: "Posts" },
];

// Sub-phase M2. Deliberately two tabs, not web search's eight — see
// GET /api/v1/search's own comment for why (communities/businesses/events/
// marketplace have no mobile screen yet to navigate a result into).
export default function ExploreScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // 350ms debounce — long enough that fast typing doesn't fire a request
  // per keystroke, short enough to still feel live.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  // No reset-state branch for `!debouncedQuery` here: the render below
  // shows DiscoverHub whenever the query is empty, regardless of whatever
  // `users`/`posts` still hold from a previous search, and the loading
  // skeleton (not stale results) is what renders while a fresh search is
  // in flight once a query reappears — so there's nothing to synchronously
  // clear, avoiding the cascading-render setState-in-effect pattern that'd
  // otherwise trigger for no real behavioral benefit.
  useEffect(() => {
    if (!debouncedQuery) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (tab === "users") {
          const result = await searchUsers(debouncedQuery);
          if (cancelled) return;
          animateNextLayout();
          setUsers(result.items);
        } else {
          const result = await searchPosts(debouncedQuery);
          if (cancelled) return;
          animateNextLayout();
          setPosts(result.items);
          setPostsNextCursor(result.nextCursor);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Search failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, tab]);

  async function onPostsEndReached() {
    if (!postsNextCursor || loadingMore || !debouncedQuery) return;
    setLoadingMore(true);
    try {
      const result = await searchPosts(debouncedQuery, postsNextCursor);
      animateNextLayout();
      setPosts((prev) => [...prev, ...result.items]);
      setPostsNextCursor(result.nextCursor);
    } catch {
      // Best-effort, same posture as every other list screen's onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

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

  async function onToggleRepost(postId: string) {
    haptics.light();
    try {
      const result = await repostPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repostCount: result.repostCount } : p)));
    } catch {
      haptics.warning();
    }
  }

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

  return (
    <View style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search people and posts" />
      </View>
      <View style={styles.tabsWrap}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {!debouncedQuery ? (
        <DiscoverHub />
      ) : loading ? (
        <View style={styles.flex}>
          {[0, 1, 2].map((i) => (
            <FeedRowSkeleton key={i} />
          ))}
        </View>
      ) : tab === "users" ? (
        <FlatList
          style={styles.flex}
          data={users}
          keyExtractor={(user) => user.username}
          renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/${item.username}`)} />}
          ListEmptyComponent={<EmptyState icon="people-outline" message={error ?? `No people found for "${debouncedQuery}".`} />}
        />
      ) : (
        <FlatList
          style={styles.flex}
          data={posts}
          keyExtractor={(post) => post.id}
          onEndReached={onPostsEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="document-text-outline" message={error ?? `No posts found for "${debouncedQuery}".`} />}
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
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    searchWrap: { padding: theme.space[4], paddingBottom: theme.space[2] },
    tabsWrap: { paddingBottom: theme.space[3] },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
