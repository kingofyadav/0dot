import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar } from "./Avatar";
import { ListRow } from "./ListRow";
import { relativeTime } from "../utils/relativeTime";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";
import type { ConversationSummary } from "../api/types";

type Props = {
  conversation: ConversationSummary;
  onPress: () => void;
  // M9: only the messages inbox passes this — the request-to-message
  // sub-screen (if one existed) or any other future consumer of this row
  // can render it without opting into a swipe action it doesn't have a
  // handler for. Omitted -> row behaves exactly as before.
  onMarkRead?: () => void;
};

export function ConversationRow({ conversation, onPress, onMarkRead }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const row = (
    <ListRow
      accessibilityLabel={`Conversation with ${conversation.title}${conversation.isUnread ? ", unread" : ""}`}
      onPress={onPress}
      highlighted={conversation.isUnread}
    >
      <View>
        <Avatar uri={conversation.avatarUrl} name={conversation.title} size={48} />
        {conversation.isOnline ? <View style={[styles.onlineDot, { borderColor: theme.colors.surface }]} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.name, conversation.isUnread && styles.nameUnread]} numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text style={styles.time}>{relativeTime(conversation.lastMessageAt)}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={[styles.preview, conversation.isUnread && styles.previewUnread]} numberOfLines={1}>
            {conversation.isRequest ? "Message request" : (conversation.lastMessagePreview ?? "")}
          </Text>
          {conversation.isUnread ? <View style={styles.dot} /> : null}
        </View>
      </View>
    </ListRow>
  );

  // Nothing to mark read on an already-read conversation — skip wrapping
  // in Swipeable entirely rather than rendering a reachable action with
  // nothing for it to do.
  if (!onMarkRead || !conversation.isUnread) return row;

  return (
    <Swipeable
      renderRightActions={(_progress, _dragX, swipeable) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark as read"
          onPress={() => {
            haptics.light();
            onMarkRead();
            swipeable.close();
          }}
          style={[styles.markReadAction, { backgroundColor: theme.colors.accent }]}
        >
          <Ionicons name="checkmark-done" size={20} color={theme.colors.onAccent} />
        </Pressable>
      )}
      rightThreshold={40}
    >
      {row}
    </Swipeable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: { flex: 1, gap: 2, justifyContent: "center" },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space[2] },
    name: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base, flexShrink: 1 },
    nameUnread: { fontWeight: theme.weight.heading },
    time: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space[2] },
    preview: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, flex: 1 },
    previewUnread: { color: theme.colors.foreground, fontWeight: theme.weight.label },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent },
    markReadAction: { width: 72, alignItems: "center", justifyContent: "center" },
    onlineDot: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: theme.colors.success,
      borderWidth: 2,
    },
  });
}
