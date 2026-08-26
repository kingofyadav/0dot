import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getFollowers, getFollowing, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { UserRow } from "../components/UserRow";
import { UserRowSkeleton } from "../components/Skeleton";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";
import type { SearchUser } from "../api/types";

type Mode = "followers" | "following";

// Mobile pro-upgrade addendum, sub-phase M13 — shared by both
// app/[username]/followers.tsx and .../following.tsx (one implementation,
// same posture ProfileScreenBody already takes for [username].tsx vs.
// (tabs)/profile.tsx) rather than two near-identical screens.
export function FollowListScreen({ username, mode }: { username: string; mode: Mode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fetchPage = mode === "followers" ? getFollowers : getFollowing;

  const [items, setItems] = useState<SearchUser[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchPage(username);
      setItems(res.items);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this list.");
    }
  }, [username, fetchPage]);

  // Unlike the Home feed / Bookmarks (which deliberately reload page 1 on
  // every focus to surface fresh content), this list rarely changes
  // moment-to-moment — reloading on every return from a visited profile
  // was silently discarding deep pagination and resetting scroll position.
  // Load once on first focus only; later focuses leave it alone.
  const isFirstLoad = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        load();
      }
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

  async function onEndReached() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(username, nextCursor);
      setItems((prev) => [...(prev ?? []), ...res.items]);
      setNextCursor(res.nextCursor);
    } catch {
      // Best-effort, same posture as every other list screen's onEndReached.
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !items) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="people-outline" message={error} onRetry={load} />
      </View>
    );
  }

  if (!items) {
    return (
      <View style={styles.screen}>
        {[0, 1, 2, 3, 4].map((i) => (
          <UserRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
        data={items}
        keyExtractor={(item) => item.username}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            message={mode === "followers" ? "No followers yet." : "Not following anyone yet."}
          />
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
        renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/${item.username}`)} />}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    emptyContent: { flexGrow: 1 },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
