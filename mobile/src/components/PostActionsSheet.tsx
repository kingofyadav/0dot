import { useMemo, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheet } from "./BottomSheet";
import { deletePost, ApiError } from "../api/client";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";
import { API_BASE_URL } from "../config";
import type { Post } from "../api/types";

type Props = {
  post: Post | null;
  isOwnPost: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

// Mobile pro-upgrade addendum, sub-phase M13 — the long-press equivalent
// of post/[id].tsx's header Share button, plus Copy link and (own posts
// only) Delete. No Report action: unlike Delete, no reportPost/
// reportContent action exists anywhere on web to mirror, and inventing a
// mutation with nothing to call would be exactly the half-built affordance
// this codebase's own conventions reject (see ConversationRow's archive-
// action scope cut, M9).
export function PostActionsSheet({ post, isOwnPost, onClose, onDeleted }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [deleting, setDeleting] = useState(false);

  async function onShare() {
    if (!post) return;
    haptics.light();
    onClose();
    const url = `${API_BASE_URL}/p/${post.id}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // User-cancelled or platform share-sheet failure — same non-
      // recoverable posture post/[id].tsx's own onShare already takes.
    }
  }

  async function onCopyLink() {
    if (!post) return;
    haptics.light();
    await Clipboard.setStringAsync(`${API_BASE_URL}/p/${post.id}`);
    onClose();
  }

  function onDeletePress() {
    if (!post) return;
    const targetId = post.id;
    haptics.light();
    Alert.alert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deletePost(targetId);
            haptics.light();
            onDeleted();
            onClose();
          } catch (err) {
            haptics.warning();
            Alert.alert("Couldn't delete this post", err instanceof ApiError ? err.message : "Please try again.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <BottomSheet visible={post !== null} onClose={onClose} title="Post">
      {post ? (
        <>
          <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share" style={styles.row}>
            <Ionicons name="share-outline" size={20} color={theme.colors.foreground} />
            <Text style={styles.rowText}>Share</Text>
          </Pressable>
          <Pressable onPress={onCopyLink} accessibilityRole="button" accessibilityLabel="Copy link" style={styles.row}>
            <Ionicons name="link-outline" size={20} color={theme.colors.foreground} />
            <Text style={styles.rowText}>Copy link</Text>
          </Pressable>
          {isOwnPost ? (
            <Pressable
              onPress={onDeletePress}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
              style={[styles.row, deleting && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              <Text style={[styles.rowText, { color: theme.colors.danger }]}>Delete</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.space[3], minHeight: 48, paddingHorizontal: theme.space[2] },
    rowText: { fontSize: theme.text.base, color: theme.colors.foreground },
  });
}
