import { useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../src/auth/AuthContext";
import { useMessagesStreamEvents } from "../../src/realtime/MessagesStreamContext";
import { getMessages, sendConversationMessage, markConversationRead, ApiError } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { EmptyState } from "../../src/components/EmptyState";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { relativeTime } from "../../src/utils/relativeTime";
import { useTheme, type Theme } from "../../src/theme";
import type { MessageItem } from "../../src/api/types";

const MAX_MESSAGE_LENGTH = 4000;

// Newest-first data + FlatList's `inverted` prop (index 0 renders at the
// bottom, growing upward) — the standard chat-list arrangement, and it
// happens to match GET /api/v1/conversations/[id]/messages' own natural
// (newest-first) response order with no client-side reversal needed.
export default function ConversationScreen() {
  const { id, title, avatarUrl } = useLocalSearchParams<{ id: string; title?: string; avatarUrl?: string }>();
  const { me } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getMessages(id);
      setMessages((prev) => {
        if (prev.length === 0) return result.items;
        // Merge: keep any newer local (just-sent) messages, add anything
        // the poll found that isn't already known, dedupe by id.
        const known = new Set(prev.map((m) => m.id));
        const fresh = result.items.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        animateNextLayout();
        return [...fresh, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
      setNextCursor((prev) => (prev === null && result.nextCursor ? result.nextCursor : prev));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this conversation.");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        await load();
        if (!cancelled) setLoading(false);
        markConversationRead(id).catch(() => {});
      })();
      return () => {
        cancelled = true;
      };
    }, [id, load])
  );

  // M10: replaces the old 5s poll — GET /api/v1/messages/stream (the same
  // bearer-token SSE connection MessagesStreamProvider holds open for the
  // whole session) pushes a `new-message`/`conversation-updated` event the
  // instant one lands, filtered to this conversation so an unrelated
  // conversation's activity elsewhere doesn't trigger a refetch here.
  useMessagesStreamEvents(
    useCallback(
      (event) => {
        if ((event.type === "new-message" || event.type === "conversation-updated") && event.conversationId === id) {
          load();
          markConversationRead(id).catch(() => {});
        }
      },
      [id, load]
    )
  );

  async function onLoadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await getMessages(id, nextCursor);
      setMessages((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      // Best-effort — same posture as every other list screen's onEndReached.
    } finally {
      setLoadingOlder(false);
    }
  }

  async function onSend() {
    const body = draft.trim();
    if (!body || sending || !me) return;
    setSending(true);
    setDraft("");
    // Optimistic append with a locally-generated id — replaced by the
    // server's real row once the request resolves, same "known-direction
    // optimism, roll back only on failure" posture as the feed's like toggle.
    const optimisticId = `local-${Date.now()}`;
    const optimistic: MessageItem = {
      id: optimisticId,
      body,
      senderId: me.id,
      attachmentType: null,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    animateNextLayout();
    setMessages((prev) => [optimistic, ...prev]);
    try {
      const sent = await sendConversationMessage(id, body);
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? sent : m)));
    } catch (err) {
      haptics.warning();
      animateNextLayout();
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(body);
      setError(err instanceof ApiError ? err.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Avatar uri={avatarUrl ?? null} name={title ?? "Conversation"} size={28} />
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {title ?? "Conversation"}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        {loading ? (
          <View style={styles.flex} />
        ) : (
          <FlatList
            style={styles.flex}
            inverted
            data={messages}
            keyExtractor={(m) => m.id}
            onEndReached={onLoadOlder}
            onEndReachedThreshold={0.4}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyState icon="chatbubble-ellipses-outline" message={error ?? "Say hello 👋"} />
              </View>
            }
            renderItem={({ item }) => {
              const isMine = item.senderId === me?.id;
              return (
                <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                      {item.deletedAt ? "Message deleted" : item.body ?? "📎 Attachment"}
                    </Text>
                  </View>
                  <Text style={styles.bubbleTime}>{relativeTime(item.createdAt)}</Text>
                </View>
              );
            }}
          />
        )}

        <SafeAreaView edges={["bottom"]} style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            placeholder="Message…"
            placeholderTextColor={theme.colors.mutedForeground}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            accessibilityLabel="Message text"
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonDisabled,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="arrow-up" size={18} color={theme.colors.onAccent} />
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { padding: theme.space[4], gap: theme.space[2] },
    emptyWrap: { transform: [{ scaleY: -1 }] },
    headerTitle: { flexDirection: "row", alignItems: "center", gap: theme.space[2] },
    headerTitleText: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis, color: theme.colors.foreground, maxWidth: 200 },
    bubbleRow: { marginBottom: theme.space[2], maxWidth: "80%" },
    bubbleRowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
    bubbleRowTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
    bubble: { borderRadius: theme.radius.lg, paddingVertical: theme.space[2], paddingHorizontal: theme.space[4] },
    bubbleMine: { backgroundColor: theme.colors.accent, borderBottomRightRadius: theme.radius.sm },
    bubbleTheirs: { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderBottomLeftRadius: theme.radius.sm },
    bubbleText: { fontSize: theme.text.base, color: theme.colors.foreground, lineHeight: theme.text.base * 1.3 },
    bubbleTextMine: { color: theme.colors.onAccent },
    bubbleTime: { fontSize: theme.text.xs, color: theme.colors.mutedForeground, marginTop: 2 },
    composerBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.space[2],
      padding: theme.space[3],
      backgroundColor: theme.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[2],
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: { backgroundColor: theme.colors.border },
  });
}
