import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { getWalletTransactions, ApiError } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { WalletActivityRow } from "../../src/components/WalletActivityRow";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { WalletTransactionEntry } from "../../src/api/types";

// The full coin ledger (grants, purchases, holds, admin adjustments — not
// just peer transfers, unlike wallet.tsx's own history preview). Same
// cursor-pagination recipe as bookmarks.tsx/blocked-users.tsx.
export default function WalletTransactionsScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [entries, setEntries] = useState<WalletTransactionEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const page = await getWalletTransactions();
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your activity.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await loadFirstPage();
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
      const page = await getWalletTransactions({ cursor: nextCursor });
      setEntries((prev) => [...prev, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch {
      // Best-effort, same posture as bookmarks.tsx's own onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { padding: theme.space[5], gap: theme.space[3] }]}>
        <SkeletonBlock width="100%" height={16} />
        <SkeletonBlock width="100%" height={16} />
        <SkeletonBlock width="100%" height={16} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      contentContainerStyle={[styles.list, entries.length === 0 ? styles.grow : undefined]}
      data={entries}
      keyExtractor={(entry) => entry.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        <EmptyState icon="receipt-outline" message={error ?? "No activity yet."} onRetry={error ? loadFirstPage : undefined} />
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
      renderItem={({ item }) => <WalletActivityRow entry={item} />}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: theme.space[5] },
    grow: { flexGrow: 1 },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
