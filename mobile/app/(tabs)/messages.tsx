import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getConversations, markConversationRead, ApiError } from "../../src/api/client";
import { ConversationRow } from "../../src/components/ConversationRow";
import { EmptyState } from "../../src/components/EmptyState";
import { useMessagesStreamEvents } from "../../src/realtime/MessagesStreamContext";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { ConversationSummary } from "../../src/api/types";

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
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  // M10: replaces the 20s poll — the same app-wide SSE connection
  // ConversationScreen (messages/[id].tsx) subscribes to. Any conversation
  // changing (not filtered to one id, unlike that screen — a new message
  // in any conversation should move it to the top of this list and update
  // its unread state) triggers a silent refetch.
  useMessagesStreamEvents(
    useCallback(
      (event) => {
        if (event.type === "new-message" || event.type === "conversation-updated") load(true);
      },
      [load]
    )
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

  // M9: ConversationRow's swipe action. Optimistic — updates local state
  // immediately (same "the swipe itself is the confirmation" reasoning a
  // mark-read affordance elsewhere would use) and fires the request
  // best-effort, matching messages/[id].tsx's own markConversationRead
  // call sites (`.catch(() => {})`, no user-facing error): worst case a
  // failed request here just means the row goes back to unread on the
  // next poll, not a lost or duplicated action.
  function onMarkRead(id: string) {
    animateNextLayout();
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, isUnread: false } : c)));
    markConversationRead(id).catch(() => {});
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
              onMarkRead={() => onMarkRead(item.id)}
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
