import { useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../src/auth/AuthContext";
import { useMessagesStreamEvents } from "../../src/realtime/MessagesStreamContext";
import { useUnreadBadges } from "../../src/realtime/UnreadBadgeContext";
import { getMessages, sendConversationMessage, markConversationRead, ApiError, type MessageAttachmentUpload } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { BottomSheet } from "../../src/components/BottomSheet";
import { EmptyState } from "../../src/components/EmptyState";
import { MessageAttachmentBubble } from "../../src/components/MessageAttachmentBubble";
import { SendButton } from "../../src/components/SendButton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { relativeTime } from "../../src/utils/relativeTime";
import { formatLastActive } from "../../src/utils/presence";
import { pickAttachmentFile } from "../../src/utils/attachments";
import { useVoiceRecorder } from "../../src/utils/useVoiceRecorder";
import { useTheme, type Theme } from "../../src/theme";
import type { MessageItem } from "../../src/api/types";

const MAX_MESSAGE_LENGTH = 4000;

// Newest-first data + FlatList's `inverted` prop (index 0 renders at the
// bottom, growing upward) — the standard chat-list arrangement, and it
// happens to match GET /api/v1/conversations/[id]/messages' own natural
// (newest-first) response order with no client-side reversal needed.
export default function ConversationScreen() {
  const { id, title, avatarUrl, otherUserId, isOnline, otherLastActiveAt } = useLocalSearchParams<{
    id: string;
    title?: string;
    avatarUrl?: string;
    otherUserId?: string;
    isOnline?: string;
    otherLastActiveAt?: string;
  }>();
  const { me } = useAuth();
  const { refetch: refetchUnreadBadges } = useUnreadBadges();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Seeded from the inbox row's own last-known presence (route params —
  // see (tabs)/messages.tsx's navigation call), then kept live by the same
  // stream connection MessagesStreamContext already holds open: the
  // "presence" event message-events.ts's bus already carries (markUserOnline/
  // markUserOffline, presence.ts) alongside new-message/conversation-updated.
  const [online, setOnline] = useState(isOnline === "1");
  const [lastActiveAt, setLastActiveAt] = useState(otherLastActiveAt || null);
  useMessagesStreamEvents(
    useCallback(
      (event) => {
        if (event.type === "presence" && event.userId === otherUserId) {
          setOnline(event.online);
          if (!event.online) setLastActiveAt(new Date().toISOString());
        }
      },
      [otherUserId]
    )
  );

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachmentUpload | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const voiceRecorder = useVoiceRecorder();

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
        refetchUnreadBadges();
      })();
      return () => {
        cancelled = true;
      };
    }, [id, load, refetchUnreadBadges])
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
    const attachment = pendingAttachment;
    if ((!body && !attachment) || sending || !me) return;
    setSending(true);
    setDraft("");
    setPendingAttachment(null);
    // Optimistic append with a locally-generated id — replaced by the
    // server's real row once the request resolves, same "known-direction
    // optimism, roll back only on failure" posture as the feed's like toggle.
    // No local attachment preview (the picked/recorded uri is a device
    // file path, not yet a real server URL) — the optimistic row shows
    // text only, same as compose.tsx not previewing an in-flight image
    // upload either; it's replaced by the real row (with attachment) once
    // the request resolves.
    const optimisticId = `local-${Date.now()}`;
    const optimistic: MessageItem = {
      id: optimisticId,
      body: body || null,
      senderId: me.id,
      attachmentType: null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentDurationS: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    animateNextLayout();
    setMessages((prev) => [optimistic, ...prev]);
    try {
      const sent = await sendConversationMessage(id, body, attachment ?? undefined);
      haptics.light();
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? sent : m)));
    } catch (err) {
      haptics.warning();
      animateNextLayout();
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(body);
      setPendingAttachment(attachment);
      setError(err instanceof ApiError ? err.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  async function onPickFile() {
    setShowAttachMenu(false);
    const picked = await pickAttachmentFile();
    if (picked) {
      haptics.light();
      setPendingAttachment(picked);
    }
  }

  async function onStartRecording() {
    setShowAttachMenu(false);
    const started = await voiceRecorder.start();
    if (started) haptics.light();
  }

  async function onStopRecording() {
    const result = await voiceRecorder.stop();
    haptics.light();
    if (result) setPendingAttachment(result);
  }

  async function onCancelRecording() {
    await voiceRecorder.cancel();
    haptics.light();
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Avatar uri={avatarUrl ?? null} name={title ?? "Conversation"} size={28} />
              <View style={styles.headerTitleTextWrap}>
                <Text style={styles.headerTitleText} numberOfLines={1}>
                  {title ?? "Conversation"}
                </Text>
                {otherUserId ? (
                  <Text style={styles.headerPresenceText} numberOfLines={1}>
                    {online ? "Active now" : lastActiveAt ? formatLastActive(lastActiveAt) : ""}
                  </Text>
                ) : null}
              </View>
            </View>
          ),
        }}
      />
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
                <EmptyState icon="chatbubble-ellipses-outline" message={error ?? "Say hello 👋"} />
              </View>
            }
            renderItem={({ item }) => {
              const isMine = item.senderId === me?.id;
              const hasAttachment = !item.deletedAt && item.attachmentUrl && item.attachmentType;
              return (
                <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {hasAttachment ? (
                      <MessageAttachmentBubble
                        type={item.attachmentType as "voice_note" | "file"}
                        url={item.attachmentUrl!}
                        durationS={item.attachmentDurationS}
                        isMine={isMine}
                      />
                    ) : null}
                    {item.body ? (
                      <Text
                        style={[styles.bubbleText, isMine && styles.bubbleTextMine, hasAttachment && styles.bubbleTextWithAttachment]}
                      >
                        {item.deletedAt ? "Message deleted" : item.body}
                      </Text>
                    ) : item.deletedAt ? (
                      <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>Message deleted</Text>
                    ) : null}
                  </View>
                  <Text style={styles.bubbleTime}>{relativeTime(item.createdAt)}</Text>
                </View>
              );
            }}
          />
        )}

        {pendingAttachment ? (
          <View style={styles.pendingAttachmentRow}>
            <Ionicons
              name={pendingAttachment.kind === "voice_note" ? "mic" : "document-outline"}
              size={16}
              color={theme.colors.accent}
            />
            <Text style={styles.pendingAttachmentText} numberOfLines={1}>
              {pendingAttachment.kind === "voice_note"
                ? `Voice note · ${pendingAttachment.durationS ?? 0}s`
                : pendingAttachment.name}
            </Text>
            <Pressable
              onPress={() => setPendingAttachment(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove attachment"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}

        <SafeAreaView edges={["bottom"]} style={styles.composerBar}>
          {voiceRecorder.isRecording ? (
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording… {Math.floor(voiceRecorder.durationMillis / 1000)}s</Text>
              <Pressable onPress={onCancelRecording} accessibilityRole="button" accessibilityLabel="Cancel recording" hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              </Pressable>
              <Pressable
                onPress={onStopRecording}
                accessibilityRole="button"
                accessibilityLabel="Stop recording"
                hitSlop={8}
                style={styles.stopRecordingButton}
              >
                <Ionicons name="stop" size={16} color={theme.colors.onAccent} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setShowAttachMenu(true)}
                accessibilityRole="button"
                accessibilityLabel="Attach"
                hitSlop={8}
                style={styles.attachButton}
              >
                <Ionicons name="add-circle-outline" size={26} color={theme.colors.accent} />
              </Pressable>
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
              <SendButton
                onPress={onSend}
                disabled={(!draft.trim() && !pendingAttachment) || sending}
                accessibilityLabel="Send message"
              />
            </>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>

      <BottomSheet visible={showAttachMenu} onClose={() => setShowAttachMenu(false)} title="Attach">
        <Pressable onPress={onStartRecording} accessibilityRole="button" accessibilityLabel="Record voice note" style={styles.attachMenuRow}>
          <Ionicons name="mic-outline" size={20} color={theme.colors.foreground} />
          <Text style={styles.attachMenuText}>Record voice note</Text>
        </Pressable>
        <Pressable onPress={onPickFile} accessibilityRole="button" accessibilityLabel="Attach file" style={styles.attachMenuRow}>
          <Ionicons name="document-outline" size={20} color={theme.colors.foreground} />
          <Text style={styles.attachMenuText}>Attach file</Text>
        </Pressable>
      </BottomSheet>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { padding: theme.space[4], gap: theme.space[2] },
    emptyWrap: { transform: [{ scaleY: -1 }] },
    headerTitle: { flexDirection: "row", alignItems: "center", gap: theme.space[2] },
    headerTitleTextWrap: { maxWidth: 200 },
    headerTitleText: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis, color: theme.colors.foreground },
    headerPresenceText: { fontSize: theme.text.xs, color: theme.colors.mutedForeground },
    bubbleRow: { marginBottom: theme.space[2], maxWidth: "80%" },
    bubbleRowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
    bubbleRowTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
    bubble: { borderRadius: theme.radius.lg, paddingVertical: theme.space[2], paddingHorizontal: theme.space[4] },
    bubbleMine: { backgroundColor: theme.colors.accent, borderBottomRightRadius: theme.radius.sm },
    bubbleTheirs: { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderBottomLeftRadius: theme.radius.sm },
    bubbleText: { fontSize: theme.text.base, color: theme.colors.foreground, lineHeight: theme.text.base * 1.3 },
    bubbleTextMine: { color: theme.colors.onAccent },
    bubbleTextWithAttachment: { marginTop: theme.space[2] },
    bubbleTime: { fontSize: theme.text.xs, color: theme.colors.mutedForeground, marginTop: 2 },
    pendingAttachmentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[2],
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[2],
      backgroundColor: theme.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    pendingAttachmentText: { flex: 1, fontSize: theme.text.sm, color: theme.colors.foreground },
    attachButton: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
    recordingRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space[3], minHeight: 44 },
    recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.danger },
    recordingText: { flex: 1, fontSize: theme.text.base, color: theme.colors.foreground },
    stopRecordingButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    attachMenuRow: { flexDirection: "row", alignItems: "center", gap: theme.space[3], minHeight: 48, paddingHorizontal: theme.space[2] },
    attachMenuText: { fontSize: theme.text.base, color: theme.colors.foreground },
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
  });
}
