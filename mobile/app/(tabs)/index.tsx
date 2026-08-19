import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getFeed, ApiError } from "../../src/api/client";
import type { Post } from "../../src/api/types";

export default function HomeScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.mutedText}>{error ?? "Nothing in your feed yet."}</Text>
        </View>
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
      renderItem={({ item }) => (
        <Pressable style={styles.postCard} onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}>
          {item.author ? <Text style={styles.author}>@{item.author}</Text> : null}
          <Text numberOfLines={4}>{item.body}</Text>
          <Text style={styles.mutedText}>
            {item.likeCount} likes · {item.replyCount} replies · {item.repostCount} reposts
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  postCard: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd", gap: 6 },
  author: { fontWeight: "600" },
  mutedText: { color: "#666" },
  footerSpinner: { paddingVertical: 16 },
});
