import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getConversations, ApiError } from "../../src/api/client";
import { ConversationRow } from "../../src/components/ConversationRow";
import { EmptyState } from "../../src/components/EmptyState";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { ConversationSummary } from "../../src/api/types";

// Polling, not a live socket — sub-phase M3's architecture decision (see
// GET /api/v1/conversations' own comment): 20s while this tab is focused,
// stopped the instant it isn't, so backgrounding the app doesn't keep
// spending the app's shared per-hour API rate limit for no visible benefit.
const POLL_INTERVAL_MS = 20000;

export default function MessagesScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const { items } = await getConversations();
      animateNextLayout();
      setConversations(items);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Could not load your messages.");
    }
  }, []);

  const isFirstLoad = useRef(true);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (isFirstLoad.current) {
          setLoading(true);
          await load();
          if (!cancelled) setLoading(false);
          isFirstLoad.current = false;
        } else {
          await load(true);
        }
      })();

      const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={styles.centerSpinner} color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.contentWrap, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
        <FlatList
          style={styles.screen}
          contentContainerStyle={conversations.length === 0 ? styles.grow : undefined}
          data={conversations}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon={error ? "cloud-offline-outline" : "chatbubbles-outline"}
              message={error ?? "No messages yet. Start a conversation with someone you follow."}
              onRetry={error ? () => load() : undefined}
            />
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                router.push({ pathname: "/messages/[id]", params: { id: item.id, title: item.title, avatarUrl: item.avatarUrl ?? "" } })
              }
            />
          )}
        />
        <Pressable
          onPress={() => router.push("/messages/new")}
          accessibilityRole="button"
          accessibilityLabel="New message"
          style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="create-outline" size={24} color={theme.colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    contentWrap: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.colors.background },
    grow: { flexGrow: 1 },
    centerSpinner: { flex: 1 },
    fab: {
      position: "absolute",
      right: theme.space[5],
      bottom: theme.space[5],
      width: 56,
      height: 56,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadow.md,
    },
  });
}
