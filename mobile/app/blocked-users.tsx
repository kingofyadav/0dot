import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { getBlockedUsers, unblockUser, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { EmptyState } from "../src/components/EmptyState";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";
import type { BlockedUser } from "../src/api/types";

// Mirrors /s/[username]/blocked/page.tsx — list + unblock. Blocking itself
// happens from a profile's own overflow menu (ProfileScreenBody.tsx), not
// from this screen, same as web (the profile page's own Block button).
export default function BlockedUsersScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [items, setItems] = useState<BlockedUser[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getBlockedUsers()
      .then((res) => {
        setItems(res.items);
        setNextCursor(res.nextCursor);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your blocked users."));
  }, []);

  useFocusEffect(load);

  async function onEndReached() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getBlockedUsers(nextCursor);
      setItems((prev) => [...(prev ?? []), ...res.items]);
      setNextCursor(res.nextCursor);
    } catch {
      // Best-effort, matching ProfileScreenBody's own onPostsEndReached posture.
    } finally {
      setLoadingMore(false);
    }
  }

  async function onUnblock(user: BlockedUser) {
    haptics.medium();
    setUnblockingId(user.userId);
    try {
      await unblockUser(user.userId);
      setItems((prev) => prev?.filter((u) => u.userId !== user.userId) ?? null);
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not unblock this account.");
    } finally {
      setUnblockingId(null);
    }
  }

  if (error && !items) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="ban-outline" message={error} onRetry={load} />
      </View>
    );
  }

  if (!items) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.userId}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        <EmptyState icon="ban-outline" message="You haven't blocked anyone." />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Avatar uri={item.avatarUrl} name={item.displayName ?? item.username} size={44} />
          <View style={styles.rowText}>
            <Text style={styles.displayName}>{item.displayName ?? "Unknown"}</Text>
            {item.username ? <Text style={styles.handle}>@{item.username}</Text> : null}
          </View>
          <Pressable
            onPress={() => onUnblock(item)}
            disabled={unblockingId === item.userId}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${item.displayName ?? item.username ?? "user"}`}
            style={({ pressed }) => [styles.unblockButton, { opacity: pressed || unblockingId === item.userId ? 0.6 : 1 }]}
          >
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: theme.space[4], flexGrow: 1 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      paddingVertical: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowText: { flex: 1, gap: 2 },
    displayName: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis, color: theme.colors.foreground },
    handle: { fontSize: theme.text.sm, color: theme.colors.mutedForeground },
    unblockButton: {
      minHeight: 36,
      paddingHorizontal: theme.space[4],
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    unblockText: { color: theme.colors.foreground, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
