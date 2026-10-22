import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import {
  searchUsers,
  searchPosts,
  searchCommunities,
  searchBusinesses,
  searchEvents,
  searchMarketplace,
  likePost,
  repostPost,
  toggleBookmark,
  ApiError,
} from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { DiscoverHub } from "../../src/components/DiscoverHub";
import { EmptyState } from "../../src/components/EmptyState";
import { ListRow } from "../../src/components/ListRow";
import { PostActionsSheet } from "../../src/components/PostActionsSheet";
import { PostRow } from "../../src/components/PostRow";
import { ReplySheet } from "../../src/components/ReplySheet";
import { UserRow } from "../../src/components/UserRow";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { SearchBar } from "../../src/components/SearchBar";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { openMarketplaceItem } from "../../src/links/openMarketplaceItem";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTabBarContentPadding } from "../../src/utils/useTabBarInset";
import { useTheme, type Theme } from "../../src/theme";
import type { Post, SearchUser, CommunitySummary, BusinessSummary, EventSearchResult, MarketplaceItem } from "../../src/api/types";

type Tab = "users" | "posts" | "communities" | "businesses" | "events" | "marketplace";
const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "People" },
  { key: "posts", label: "Posts" },
  { key: "communities", label: "Communities" },
  { key: "businesses", label: "Businesses" },
  { key: "events", label: "Events" },
  { key: "marketplace", label: "Marketplace" },
];

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// Sub-phase M2 shipped two tabs (users/posts); M13 widens to all six now
// that M4-M6 gave mobile a native screen for communities/businesses/events/
// marketplace to navigate a result into — GET /api/v1/search's own comment
// has the full reasoning for why this was deferred and what unblocked it.
export default function ExploreScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const tabBarInset = useTabBarContentPadding();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { me } = useAuth();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Post | null>(null);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [events, setEvents] = useState<EventSearchResult[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  // Bumped at the start of every runSearch call below (the debounced-search
  // effect, a tab switch, AND pull-to-refresh — all three go through
  // runSearch) — onPostsEndReached snapshots it before firing its own
  // request and checks it again after awaiting, so a pagination fetch that
  // was still in flight when a newer search started (including a refresh)
  // can't append its (now-stale) results onto the result set that search
  // already replaced `posts` with.
  const searchGenerationRef = useRef(0);
  // Mirrors postsNextCursor, updated at every spot that updates that state
  // (runSearch's "posts" branch, onPostsEndReached's own success case).
  // Second line of defense for onPostsEndReached specifically (code review
  // caught a gap the generation check alone didn't close): a pull-to-refresh
  // and an in-flight pagination fetch can end up sharing the same
  // searchGenerationRef value (refresh bumps it once; nothing bumps it again
  // for the pagination fetch that started after), so the generation check
  // alone can't tell "a refresh replaced the list out from under me" apart
  // from "nothing happened." Comparing the cursor onPostsEndReached actually
  // paginated from against the current one catches that: a refresh always
  // moves this ref, even when the generation number happens to match.
  const postsNextCursorRef = useRef<string | null>(null);

  // 350ms debounce — long enough that fast typing doesn't fire a request
  // per keystroke, short enough to still feel live.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Shared by the debounced-search effect and onRefresh below (code review
  // caught the previous split: onRefresh duplicated this whole switch AND
  // never bumped searchGenerationRef, so a pull-to-refresh could race a
  // still-in-flight onPostsEndReached pagination fetch — that fetch's own
  // generation check never saw the refresh as a newer generation, so its
  // stale page landed on top of the just-refreshed list). Returns whether
  // this call is still the current generation once it finishes, so the
  // effect can tell a superseded (out-of-order-resolved) call apart from
  // the one that should actually clear the loading spinner.
  const runSearch = useCallback(async (q: string, currentTab: Tab): Promise<boolean> => {
    const myGeneration = ++searchGenerationRef.current;
    setError(null);
    try {
      if (currentTab === "users") {
        const result = await searchUsers(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setUsers(result.items);
      } else if (currentTab === "posts") {
        // "posts" is the one tab with its own pagination (onPostsEndReached
        // below) — a 7th tab that also needs infinite scroll would need the
        // same cursor-ref treatment there, mirroring this branch.
        const result = await searchPosts(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setPosts(result.items);
        setPostsNextCursor(result.nextCursor);
        postsNextCursorRef.current = result.nextCursor;
      } else if (currentTab === "communities") {
        const result = await searchCommunities(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setCommunities(result.items);
      } else if (currentTab === "businesses") {
        const result = await searchBusinesses(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setBusinesses(result.items);
      } else if (currentTab === "events") {
        const result = await searchEvents(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setEvents(result.items);
      } else {
        const result = await searchMarketplace(q);
        if (myGeneration !== searchGenerationRef.current) return false;
        animateNextLayout();
        setMarketplaceItems(result.items);
      }
      return myGeneration === searchGenerationRef.current;
    } catch (err) {
      if (myGeneration !== searchGenerationRef.current) return false;
      setError(err instanceof ApiError ? err.message : "Search failed.");
      return true;
    }
  }, []);

  // No reset-state branch for `!debouncedQuery` here: the render below
  // shows DiscoverHub whenever the query is empty, regardless of whatever
  // `users`/`posts` still hold from a previous search, and the loading
  // skeleton (not stale results) is what renders while a fresh search is
  // in flight once a query reappears — so there's nothing to synchronously
  // clear, avoiding the cascading-render setState-in-effect pattern that'd
  // otherwise trigger for no real behavioral benefit.
  useEffect(() => {
    if (!debouncedQuery) return;
    // IIFE (not a bare setLoading(true) in the effect body) for the same
    // reason the original version of this effect used one — satisfies
    // react-hooks/set-state-in-effect. isCurrent (not a bare .finally): if
    // this call gets superseded by a newer one before it resolves, only the
    // newer one's resolution should ever flip `loading` back off, regardless
    // of which actually settles first over the network.
    (async () => {
      setLoading(true);
      const isCurrent = await runSearch(debouncedQuery, tab);
      if (isCurrent) setLoading(false);
    })();
  }, [debouncedQuery, tab, runSearch]);

  async function onRefresh() {
    if (!debouncedQuery) return;
    haptics.light();
    setRefreshing(true);
    await runSearch(debouncedQuery, tab);
    setRefreshing(false);
  }

  // The posts-only counterpart to runSearch's "posts" branch above (its own
  // comment points back here) — this is the one tab with pagination, so it's
  // the one place besides runSearch itself that needs to stay in sync if a
  // future tab also grows infinite scroll.
  async function onPostsEndReached() {
    if (!postsNextCursor || loadingMore || !debouncedQuery) return;
    const myGeneration = searchGenerationRef.current;
    const cursorUsed = postsNextCursor;
    setLoadingMore(true);
    try {
      const result = await searchPosts(debouncedQuery, cursorUsed);
      // Both checks, not just the generation: the query/tab changed (a
      // newer search started) catches most cases, but a pull-to-refresh can
      // share this same generation number with an in-flight pagination
      // fetch that started after it (see postsNextCursorRef's own comment)
      // — comparing the cursor this fetch actually paginated from against
      // the current one catches that case too.
      if (myGeneration !== searchGenerationRef.current || postsNextCursorRef.current !== cursorUsed) return;
      animateNextLayout();
      setPosts((prev) => [...prev, ...result.items]);
      setPostsNextCursor(result.nextCursor);
      postsNextCursorRef.current = result.nextCursor;
    } catch {
      // Best-effort, same posture as every other list screen's onEndReached.
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

  function onOpenMarketplaceItem(item: MarketplaceItem) {
    haptics.light();
    openMarketplaceItem(item);
  }

  // One shared element (code review caught this duplicated verbatim across
  // all six FlatLists below) — React elements are plain descriptors, so
  // reusing the same one across multiple trees is safe.
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />;

  return (
    <View style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search 0dot" />
      </View>
      <View style={styles.tabsWrap}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {!debouncedQuery ? (
        <DiscoverHub bottomInset={tabBarInset.paddingBottom} />
      ) : loading ? (
        <View style={styles.flex}>
          {[0, 1, 2].map((i) => (
            <FeedRowSkeleton key={i} />
          ))}
        </View>
      ) : tab === "users" ? (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={users}
          keyExtractor={(user) => user.username}
          refreshControl={refreshControl}
          renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/${item.username}`)} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title={error ?? `No people found for "${debouncedQuery}".`} />}
        />
      ) : tab === "posts" ? (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={posts}
          keyExtractor={(post) => post.id}
          refreshControl={refreshControl}
          onEndReached={onPostsEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="document-text-outline" title={error ?? `No posts found for "${debouncedQuery}".`} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : undefined}
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
      ) : tab === "communities" ? (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={communities}
          keyExtractor={(item) => item.slug}
          refreshControl={refreshControl}
          ListEmptyComponent={<EmptyState icon="people-circle-outline" title={error ?? `No communities found for "${debouncedQuery}".`} />}
          renderItem={({ item }) => (
            <ListRow accessibilityLabel={`View ${item.name}`} onPress={() => router.push({ pathname: "/community/[slug]", params: { slug: item.slug } })}>
              <Avatar uri={item.avatarUrl} name={item.name} size={44} />
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {item.memberCount} {item.memberCount === 1 ? "member" : "members"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
            </ListRow>
          )}
        />
      ) : tab === "businesses" ? (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={businesses}
          keyExtractor={(item) => item.slug}
          refreshControl={refreshControl}
          ListEmptyComponent={<EmptyState icon="storefront-outline" title={error ?? `No businesses found for "${debouncedQuery}".`} />}
          renderItem={({ item }) => (
            <ListRow accessibilityLabel={`View ${item.name}`} onPress={() => router.push({ pathname: "/business/[slug]", params: { slug: item.slug } })}>
              <Avatar uri={item.logoUrl} name={item.name} size={44} />
              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isVerified ? <VerifiedBadge size={14} /> : null}
                </View>
                <Text style={styles.meta}>{item.status === "pending" ? "Pending review" : item.category}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
            </ListRow>
          )}
        />
      ) : tab === "events" ? (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={events}
          keyExtractor={(item) => item.slug}
          refreshControl={refreshControl}
          ListEmptyComponent={<EmptyState icon="calendar-outline" title={error ?? `No events found for "${debouncedQuery}".`} />}
          renderItem={({ item }) => (
            <ListRow accessibilityLabel={`View ${item.title}`} onPress={() => router.push({ pathname: "/event/[slug]", params: { slug: item.slug } })}>
              <View style={[styles.iconFallback, { backgroundColor: theme.colors.accentSoft }]}>
                <Ionicons name="calendar" size={20} color={theme.colors.accentStrong} />
              </View>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>{formatWhen(item.startsAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
            </ListRow>
          )}
        />
      ) : (
        <FlatList
          style={styles.flex}
          contentContainerStyle={tabBarInset}
          data={marketplaceItems}
          keyExtractor={(item) => `${item.category}-${item.id}`}
          refreshControl={refreshControl}
          ListEmptyComponent={<EmptyState icon="bag-outline" title={error ?? `No marketplace results found for "${debouncedQuery}".`} />}
          renderItem={({ item }) => (
            <ListRow accessibilityLabel={`Open ${item.title}`} onPress={() => onOpenMarketplaceItem(item)}>
              <View style={styles.body}>
                <Text style={styles.categoryLabel}>{item.categoryLabel}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <Text style={styles.price}>{item.priceLabel}</Text>
            </ListRow>
          )}
        />
      )}
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
    flex: { flex: 1 },
    searchWrap: { padding: theme.space[4], paddingBottom: theme.space[2] },
    tabsWrap: { paddingBottom: theme.space[3] },
    footerSpinner: { paddingVertical: theme.space[4] },
    body: { flex: 1, gap: 2, justifyContent: "center" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    name: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    iconFallback: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
    categoryLabel: { color: theme.colors.accent, fontSize: theme.text.xs, fontWeight: theme.weight.label, textTransform: "uppercase" },
    price: { color: theme.colors.foreground, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
  });
}
