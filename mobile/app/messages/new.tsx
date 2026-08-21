import { useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getMessageCandidates, startConversation, ApiError } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { EmptyState } from "../../src/components/EmptyState";
import { ListRow } from "../../src/components/ListRow";
import { FeedRowSkeleton } from "../../src/components/Skeleton";
import { haptics } from "../../src/utils/haptics";
import { useTheme, type Theme } from "../../src/theme";
import type { MessageableCandidate } from "../../src/api/types";

const MAX_MESSAGE_LENGTH = 4000;

// Picker pool is the follow-graph, same as web's new-DM picker (messaging.ts's
// getMessageableCandidates — no global user search exists for "who can I
// start a conversation with" yet, see that route's own comment).
export default function NewMessageScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [candidates, setCandidates] = useState<MessageableCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<MessageableCandidate | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await getMessageCandidates();
      setCandidates(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load who you can message.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onSend() {
    const body = draft.trim();
    if (!recipient || !body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await startConversation({ recipientId: recipient.userId, body });
      haptics.light();
      router.replace({
        pathname: "/messages/[id]",
        params: { id: result.conversationId, title: recipient.displayName, avatarUrl: recipient.avatarUrl ?? "" },
      });
    } catch (err) {
      haptics.warning();
      setSendError(err instanceof ApiError ? err.message : "Could not start this conversation.");
    } finally {
      setSending(false);
    }
  }

  if (recipient) {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <View style={styles.recipientHeader}>
          <Avatar uri={recipient.avatarUrl} name={recipient.displayName} size={40} />
          <Text style={styles.recipientName}>{recipient.displayName}</Text>
        </View>
        {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
        <View style={styles.spacer} />
        <View style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            placeholder={`Message @${recipient.handle ?? recipient.displayName}…`}
            placeholderTextColor={theme.colors.mutedForeground}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            autoFocus
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
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      {loading ? (
        [0, 1, 2, 3].map((i) => <FeedRowSkeleton key={i} />)
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(c) => c.userId}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              message={error ?? "Follow people on 0dot to start messaging them."}
              onRetry={error ? load : undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow accessibilityLabel={`Message ${item.displayName}`} onPress={() => setRecipient(item)}>
              <Avatar uri={item.avatarUrl} name={item.displayName} size={44} />
              <View style={styles.candidateBody}>
                <Text style={styles.candidateName}>{item.displayName}</Text>
                {item.handle ? <Text style={styles.candidateHandle}>@{item.handle}</Text> : null}
              </View>
            </ListRow>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    candidateBody: { flex: 1, gap: 2, justifyContent: "center" },
    candidateName: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    candidateHandle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    recipientHeader: { flexDirection: "row", alignItems: "center", gap: theme.space[3], padding: theme.space[4] },
    recipientName: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    error: { color: theme.colors.danger, fontSize: theme.text.sm, paddingHorizontal: theme.space[4] },
    spacer: { flex: 1 },
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
