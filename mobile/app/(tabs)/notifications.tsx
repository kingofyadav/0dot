import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { getNotifications, markNotificationsRead, ApiError } from "../../src/api/client";
import { resolvePath } from "../../src/links/resolvePath";
import type { NotificationItem } from "../../src/api/types";

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { items: rows, nextCursor: cursor } = await getNotifications();
      setItems(rows);
      setNextCursor(cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your notifications.");
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
      const { items: rows, nextCursor: cursor } = await getNotifications(nextCursor);
      setItems((prev) => [...prev, ...rows]);
      setNextCursor(cursor);
    } catch {
      // Same best-effort posture as the feed's onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

  async function onMarkAllRead() {
    // Optimistic — this is the reader's own read-receipt state, not
    // content that could conflict with a concurrent write elsewhere.
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    try {
      await markNotificationsRead();
    } catch {
      await loadFirstPage();
    }
  }

  const hasUnread = items.some((item) => !item.isRead);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={hasUnread ? <Button title="Mark all read" onPress={onMarkAllRead} /> : null}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.mutedText}>{error ?? "No notifications yet."}</Text>
        </View>
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
      renderItem={({ item }) => (
        <Pressable style={[styles.row, !item.isRead && styles.unreadRow]} onPress={() => resolvePath(item.href)}>
          <Text>
            {item.actor?.displayName ?? item.actor?.username ?? "Someone"} {item.verb}
          </Text>
          <Text style={styles.mutedText}>{new Date(item.createdAt).toLocaleString()}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd", gap: 4 },
  unreadRow: { backgroundColor: "#eef4ff" },
  mutedText: { color: "#666" },
  footerSpinner: { paddingVertical: 16 },
});
