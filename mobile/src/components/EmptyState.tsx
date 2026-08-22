import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  onRetry?: () => void;
};

// Shared by every screen's empty/error list state. Previously each screen
// just rendered static muted text with no way to recover from a real error
// (a dropped connection, a 5xx) short of a manual pull-to-refresh the user
// had no prompt to discover — onRetry surfaces that same recovery action
// as a visible button instead.
export function EmptyState({ icon, message, onRetry }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={theme.colors.mutedForeground} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={() => {
            haptics.light();
            onRetry();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[8], gap: theme.space[3] },
    message: { fontSize: theme.text.sm, textAlign: "center", color: theme.colors.mutedForeground },
    retryButton: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingVertical: theme.space[3],
      paddingHorizontal: theme.space[5],
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    retryText: { fontWeight: theme.weight.emphasis, fontSize: theme.text.sm, color: theme.colors.accent },
  });
}
