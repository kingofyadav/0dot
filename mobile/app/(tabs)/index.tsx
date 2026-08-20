import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getFeed, ApiError } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { relativeTime } from "../../src/utils/relativeTime";
import { useTheme, type Theme } from "../../src/theme";
import type { Post } from "../../src/api/types";

export default function HomeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { items, nextCursor: cursor } = await getFeed();
      setPosts(items);
      setNextCursor(cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your feed.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadFirstPage();
      setLoading(false);
    })();
  }, [loadFirstPage]);

  async function onRefresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function onEndReached() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items, nextCursor: cursor } = await getFeed(nextCursor);
      setPosts((prev) => [...prev, ...items]);
      setNextCursor(cursor);
    } catch {
      // Best-effort — a failed "load more" shouldn't clear what's already
      // showing; the user can pull-to-refresh or scroll again to retry.
    } finally {
      setLoadingMore(false);
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
    <FlatList
      style={styles.screen}
      contentContainerStyle={posts.length === 0 ? styles.grow : undefined}
      data={posts}
      keyExtractor={(post) => post.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        <EmptyState
          icon={error ? "cloud-offline-outline" : "newspaper-outline"}
          message={error ?? "Nothing in your feed yet. Follow people on 0dot to see their posts here."}
          onRetry={error ? loadFirstPage : undefined}
        />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Post by ${item.authorDisplayName ?? item.author ?? "someone"}`}
          style={({ pressed }) => [styles.postCard, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
        >
          <Avatar uri={item.authorAvatarUrl} name={item.authorDisplayName ?? item.author} size={44} />
          <View style={styles.postBody}>
            <View style={styles.byline}>
              <Text style={styles.author} numberOfLines={1}>
                {item.authorDisplayName ?? (item.author ? `@${item.author}` : "0dot user")}
              </Text>
              {item.authorVerified ? <VerifiedBadge size={14} /> : null}
              <Text style={styles.dot}>·</Text>
              <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
            </View>
            <Text style={styles.postText} numberOfLines={4}>
              {item.body}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="heart-outline" size={15} color={theme.colors.mutedForeground} />
                <Text style={styles.statText}>{item.likeCount}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="chatbubble-outline" size={14} color={theme.colors.mutedForeground} />
                <Text style={styles.statText}>{item.replyCount}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="repeat-outline" size={16} color={theme.colors.mutedForeground} />
                <Text style={styles.statText}>{item.repostCount}</Text>
              </View>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    grow: { flexGrow: 1 },
    postCard: {
      flexDirection: "row",
      gap: theme.space[3],
      padding: theme.space[4],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    postBody: { flex: 1, gap: theme.space[1] },
    byline: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    author: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.sm, flexShrink: 1 },
    dot: { color: theme.colors.mutedForeground },
    time: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    postText: { color: theme.colors.foreground, fontSize: theme.text.base, lineHeight: theme.text.base * 1.3 },
    statsRow: { flexDirection: "row", gap: theme.space[5], marginTop: theme.space[1] },
    stat: { flexDirection: "row", alignItems: "center", gap: 4 },
    statText: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
