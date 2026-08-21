import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "./Avatar";
import { ListRow } from "./ListRow";
import { relativeTime } from "../utils/relativeTime";
import { useTheme, type Theme } from "../theme";
import type { ConversationSummary } from "../api/types";

export function ConversationRow({ conversation, onPress }: { conversation: ConversationSummary; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ListRow
      accessibilityLabel={`Conversation with ${conversation.title}${conversation.isUnread ? ", unread" : ""}`}
      onPress={onPress}
      highlighted={conversation.isUnread}
    >
      <Avatar uri={conversation.avatarUrl} name={conversation.title} size={48} />
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
  });
}
