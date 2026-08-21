import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { ListRow } from "./ListRow";
import { useTheme, type Theme } from "../theme";
import type { SearchUser } from "../api/types";

// Shared user-result row — Explore's Users tab today, the DM "new
// conversation" picker in sub-phase M3, any later "pick a person" list —
// same avatar/name/handle shape PostRow's byline uses, just as the whole
// row rather than a byline within a post card.
export function UserRow({ user, onPress }: { user: SearchUser; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ListRow accessibilityLabel={`View ${user.displayName}'s profile`} onPress={onPress}>
      <Avatar uri={user.avatarUrl} name={user.displayName} size={44} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.displayName}
          </Text>
          {user.isVerified ? <VerifiedBadge size={14} /> : null}
        </View>
        <Text style={styles.handle}>@{user.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
    </ListRow>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: { flex: 1, gap: 2, justifyContent: "center" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    name: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    handle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
