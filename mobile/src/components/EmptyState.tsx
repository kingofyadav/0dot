import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

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
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={theme.colors.mutedForeground} />
      <Text style={[styles.message, { color: theme.colors.mutedForeground }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={({ pressed }) => [
            styles.retryButton,
            { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.retryText, { color: theme.colors.accent }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  message: { fontSize: 15, textAlign: "center" },
  retryButton: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 9999, paddingVertical: 10, paddingHorizontal: 20, minHeight: 44, alignItems: "center", justifyContent: "center" },
  retryText: { fontWeight: "600", fontSize: 15 },
});
