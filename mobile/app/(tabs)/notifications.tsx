import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getNotifications, markNotificationsRead, ApiError } from "../../src/api/client";
import { resolvePath } from "../../src/links/resolvePath";
import { Avatar } from "../../src/components/Avatar";
import { EmptyState } from "../../src/components/EmptyState";
import { ListRow } from "../../src/components/ListRow";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { relativeTime } from "../../src/utils/relativeTime";
import { getNotificationIcon } from "../../src/utils/notificationIcon";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { getCached, setCached } from "../../src/utils/offlineCache";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { NotificationItem } from "../../src/api/types";

const CACHE_KEY = "notifications";

export default function NotificationsScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { items: rows, nextCursor: cursor } = await getNotifications();
      setItems(rows);
      setNextCursor(cursor);
      setOfflineCachedAt(null);
      setCached(CACHE_KEY, rows);
    } catch (err) {
      const cached = await getCached<NotificationItem[]>(CACHE_KEY);
      if (cached && cached.value.length > 0) {
        setItems(cached.value);
        setNextCursor(null);
        setOfflineCachedAt(cached.cachedAt);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load your notifications.");
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadFirstPage();
      animateNextLayout();
      setLoading(false);
    })();
  }, [loadFirstPage]);

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
      const { items: rows, nextCursor: cursor } = await getNotifications(nextCursor);
      animateNextLayout();
      setItems((prev) => [...prev, ...rows]);
      setNextCursor(cursor);
    } catch {
      // Same best-effort posture as the feed's onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

  async function onMarkAllRead() {
    haptics.light();
    animateNextLayout();
    // Optimistic — this is the reader's own read-receipt state, not
    // content that could conflict with a concurrent write elsewhere.
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    try {
      await markNotificationsRead();
    } catch {
      haptics.warning();
      await loadFirstPage();
    }
  }

  const hasUnread = items.some((item) => !item.isRead);

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
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      contentContainerStyle={items.length === 0 ? styles.grow : undefined}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <>
          {offlineCachedAt ? <OfflineBanner cachedAt={offlineCachedAt} /> : null}
          {hasUnread ? (
            <Pressable
              onPress={onMarkAllRead}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications read"
              style={({ pressed }) => [styles.markAllRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null}
        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon={error ? "cloud-offline-outline" : "notifications-outline"}
          message={error ?? "No notifications yet."}
          onRetry={error ? loadFirstPage : undefined}
        />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
      renderItem={({ item }) => {
        const { icon, tint } = getNotificationIcon(item.type);
        const actorName = item.actor?.displayName ?? item.actor?.username ?? "Someone";
        return (
          <ListRow
            accessibilityLabel={`${actorName} ${item.verb}`}
            highlighted={!item.isRead}
            style={styles.row}
            onPress={() => resolvePath(item.href)}
          >
            <View style={styles.avatarStack}>
              <Avatar uri={item.actor?.avatarUrl} name={actorName} size={40} />
              <View style={[styles.iconBadge, { backgroundColor: theme.colors[tint], borderColor: theme.colors.surface }]}>
                {/* onAccent/onSuccess/onWarning/onDanger all resolve to the
                    same near-black hex per docs/DESIGN_SYSTEM.md, so one
                    fixed token covers every tint without a dynamic key
                    lookup. */}
                <Ionicons name={icon} size={11} color={theme.colors.onAccent} />
              </View>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowText}>
                <Text style={styles.rowActor}>{actorName}</Text>
                {item.actor?.isVerified ? <VerifiedBadge size={13} /> : null} {item.verb}
              </Text>
              <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
            </View>
            {!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: theme.colors.accent }]} /> : null}
          </ListRow>
        );
      }}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    grow: { flexGrow: 1 },
    markAllRow: { alignItems: "flex-end", justifyContent: "center", minHeight: 44, padding: theme.space[3], paddingHorizontal: theme.space[4] },
    markAllText: { color: theme.colors.accent, fontWeight: theme.weight.emphasis, fontSize: theme.text.sm },
    row: { alignItems: "center" },
    avatarStack: { width: 40, height: 40, position: "relative" },
    iconBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: { flex: 1, gap: 2 },
    rowText: { color: theme.colors.foreground, fontSize: theme.text.sm },
    rowActor: { fontWeight: theme.weight.emphasis },
    time: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
