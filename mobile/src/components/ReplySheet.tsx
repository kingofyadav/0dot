import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { createPost, ApiError } from "../api/client";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";
import type { Post } from "../api/types";

const MAX_LENGTH = 500;

type Props = {
  post: Post | null;
  onClose: () => void;
  // Called after a reply is successfully posted — lets the caller bump
  // the parent post's local replyCount optimistically, matching how
  // like/bookmark already update their own screen's local state.
  onReplied?: () => void;
};

// One shared quick-reply sheet, opened from PostRow's reply icon wherever
// a post renders (feed, post detail, bookmarks, profile, explore,
// community) — a BottomSheet + inline composer rather than a second copy
// of compose.tsx's UI, since this only ever needs a body field, not
// compose's image picker.
export function ReplySheet({ post, onClose, onReplied }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (sending) return;
    setBody("");
    setError(null);
    onClose();
  }

  async function onSend() {
    if (!post || body.trim().length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await createPost({ body: body.trim(), replyToId: post.id });
      haptics.light();
      setBody("");
      onReplied?.();
      onClose();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  const canSend = body.trim().length > 0 && !sending;

  return (
    <BottomSheet visible={post !== null} onClose={handleClose} title="Reply">
      {post ? (
        <View style={styles.wrap}>
          <Text style={styles.replyingTo} numberOfLines={1}>
            Replying to {post.authorDisplayName ?? (post.author ? `@${post.author}` : "someone")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Post your reply"
            placeholderTextColor={theme.colors.mutedForeground}
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
            maxLength={MAX_LENGTH}
            accessibilityLabel="Reply text"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={handleClose} disabled={sending} style={styles.actionButton} />
            <Button label="Reply" onPress={onSend} disabled={!canSend} loading={sending} style={styles.actionButton} />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: theme.space[3], paddingBottom: theme.space[2] },
    replyingTo: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[3],
      minHeight: 88,
      textAlignVertical: "top",
    },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    actions: { flexDirection: "row", gap: theme.space[3] },
    actionButton: { flex: 1 },
  });
}
