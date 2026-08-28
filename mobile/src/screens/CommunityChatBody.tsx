import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import {
  getCommunityChat,
  sendCommunityChatMessage,
  deleteCommunityChatMessage,
  sendCommunityChatTyping,
  ApiError,
} from "../api/client";
import { createCommunityChatStream } from "../realtime/communityChatStream";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { SendButton } from "../components/SendButton";
import { animateNextLayout } from "../utils/animateLayout";
import { haptics } from "../utils/haptics";
import { relativeTime } from "../utils/relativeTime";
import { useTheme, type Theme } from "../theme";
import type { CommunityChatMessage } from "../api/types";

const MAX_LENGTH = 500;
const TYPING_PING_INTERVAL_MS = 3_000;
const TYPING_EXPIRY_MS = 5_000;

// Realtime addendum (docs/specs/addendum-realtime-community.md) Phase C —
// the mobile community live chat screen. One SSE connection
// (createCommunityChatStream) while the screen is open and the app is
// foregrounded; history is cursor-paginated; sends round-trip through the
// v1 route and echo back over the stream. Shared as a screen body so a
// future moderator variant can reuse it — same discipline as
// ProfileScreenBody.
export function CommunityChatBody({ slug, communityName }: { slug: string; communityName?: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { me, tokens } = useAuth();

  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // userId → { name, expiresAt } — pruned on render against Date.now().
  const [typing, setTyping] = useState<Record<string, { name: string | null; expiresAt: number }>>({});

  const lastTypingPing = useRef(0);

  const load = useCallback(async () => {
    try {
      const result = await getCommunityChat(slug);
      setMessages(result.items);
      setNextCursor(result.nextCursor);
      setCanSend(result.canSend);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this chat.");
    }
  }, [slug]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      animateNextLayout();
      setLoading(false);
    })();
  }, [load]);

  // The live connection — open while this screen is mounted and the app is
  // foregrounded (eventStream owns the backoff + the `resync` on reconnect).
  useEffect(() => {
    const accessToken = tokens?.accessToken;
    if (!accessToken) return;

    const stream = createCommunityChatStream({
      slug,
      accessToken,
      onEvent: (event) => {
        if (event.type === "new-chat-message") {
          setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [event.message, ...prev]));
        } else if (event.type === "chat-message-deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
        } else if (event.type === "typing") {
          if (event.userId === me?.id) return;
          setTyping((prev) => ({ ...prev, [event.userId]: { name: event.name, expiresAt: Date.now() + TYPING_EXPIRY_MS } }));
        } else if (event.type === "resync") {
          load();
        }
      },
    });

    stream.setActive(AppState.currentState === "active");
    const appStateSub = AppState.addEventListener("change", (next) => stream.setActive(next === "active"));

    return () => {
      appStateSub.remove();
      stream.close();
    };
  }, [slug, tokens?.accessToken, me?.id, load]);

  // Prune expired "typing…" entries on a timer so the indicator clears even
  // with no further events.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.expiresAt > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [typing]);

  function onChangeDraft(text: string) {
    setDraft(text);
    if (text.trim().length === 0) return;
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_INTERVAL_MS) return;
    lastTypingPing.current = now;
    sendCommunityChatTyping(slug).catch(() => {});
  }

  async function onSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await sendCommunityChatMessage(slug, body);
      setDraft("");
      // Append immediately in case our own SSE frame is delayed or missed;
      // the `new-chat-message` echo dedupes on id.
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [message, ...prev]));
    } catch (err) {
      haptics.warning();
      Alert.alert("Couldn't send", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function onLoadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await getCommunityChat(slug, nextCursor);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...result.items.filter((m) => !known.has(m.id))];
      });
      setNextCursor(result.nextCursor);
    } catch {
      // Best-effort, same posture as the DM screen's older-page load.
    } finally {
      setLoadingOlder(false);
    }
  }

  function onLongPressMessage(message: CommunityChatMessage) {
    const isMine = message.senderId === me?.id;
    if (!isMine && !canSend) return; // non-members can't moderate from here
    haptics.light();
    Alert.alert(isMine ? "Delete your message?" : "Delete this message?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // Optimistic — the server re-broadcasts the delete, which is a
          // no-op once it's already gone locally.
          setMessages((prev) => prev.filter((m) => m.id !== message.id));
          try {
            await deleteCommunityChatMessage(slug, message.id);
          } catch (err) {
            haptics.warning();
            if (err instanceof ApiError && err.status === 403) {
              Alert.alert("Not allowed", "Only the author or a moderator can delete this message.");
            }
            load(); // restore the true state
          }
        },
      },
    ]);
  }

  // The 1s prune effect keeps `typing` free of expired entries, so no
  // Date.now() filter in render (which the purity lint rightly rejects).
  const typingNames = Object.values(typing).map((v) => v.name ?? "Someone");
  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : "Several people are typing…";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90}>
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
              <EmptyState
                icon="chatbubble-ellipses-outline"
                message={error ?? (communityName ? `Start the conversation in ${communityName}` : "No messages yet")}
              />
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === me?.id;
            return (
              <Pressable
                onLongPress={() => onLongPressMessage(item)}
                delayLongPress={300}
                style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}
              >
                {!isMine ? <Avatar uri={item.senderAvatarUrl} name={item.senderName ?? item.senderHandle} size={28} /> : null}
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!isMine ? (
                    <Text style={styles.senderName} numberOfLines={1}>
                      {item.senderName ?? (item.senderHandle ? `@${item.senderHandle}` : "Member")}
                    </Text>
                  ) : null}
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{relativeTime(item.createdAt)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {typingLabel ? <Text style={styles.typing}>{typingLabel}</Text> : null}

      <SafeAreaView edges={["bottom"]} style={styles.composerBar}>
        {canSend ? (
          <>
            <TextInput
              style={styles.composerInput}
              placeholder="Message…"
              placeholderTextColor={theme.colors.mutedForeground}
              value={draft}
              onChangeText={onChangeDraft}
              multiline
              maxLength={MAX_LENGTH}
              accessibilityLabel="Message text"
            />
            <SendButton onPress={onSend} disabled={!draft.trim() || sending} accessibilityLabel="Send message" />
          </>
        ) : (
          <Text style={styles.joinPrompt}>Join this community to send messages.</Text>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { paddingHorizontal: theme.space[3], paddingVertical: theme.space[3], gap: theme.space[2] },
    emptyWrap: { transform: [{ scaleY: -1 }], paddingTop: theme.space[16] },
    row: { flexDirection: "row", alignItems: "flex-end", gap: theme.space[2], maxWidth: "85%" },
    rowMine: { alignSelf: "flex-end" },
    rowTheirs: { alignSelf: "flex-start" },
    bubble: { borderRadius: theme.radius.lg, paddingHorizontal: theme.space[3], paddingVertical: theme.space[2], flexShrink: 1 },
    bubbleMine: { backgroundColor: theme.colors.accent, borderBottomRightRadius: theme.radius.sm },
    bubbleTheirs: { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderBottomLeftRadius: theme.radius.sm },
    senderName: { fontSize: theme.text.xs, fontWeight: theme.weight.emphasis, color: theme.colors.mutedForeground, marginBottom: 2 },
    bubbleText: { fontSize: theme.text.base, color: theme.colors.foreground, lineHeight: theme.text.base * 1.3 },
    bubbleTextMine: { color: theme.colors.onAccent },
    bubbleTime: { fontSize: theme.text.xs, color: theme.colors.mutedForeground, marginTop: 2, alignSelf: "flex-end" },
    bubbleTimeMine: { color: theme.colors.onAccent, opacity: 0.7 },
    typing: { paddingHorizontal: theme.space[4], paddingBottom: theme.space[1], fontSize: theme.text.xs, color: theme.colors.mutedForeground, fontStyle: "italic" },
    composerBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.space[2],
      paddingHorizontal: theme.space[3],
      paddingTop: theme.space[2],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    composerInput: {
      flex: 1,
      maxHeight: 120,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[2],
      fontSize: theme.text.base,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    },
    joinPrompt: { flex: 1, textAlign: "center", color: theme.colors.mutedForeground, fontSize: theme.text.sm, paddingVertical: theme.space[3] },
  });
}
