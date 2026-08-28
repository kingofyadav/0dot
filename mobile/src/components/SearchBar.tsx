import { useMemo } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
};

// Built for Explore's search field, generic enough for any later
// find-as-you-type screen (marketplace/community browse) — search icon
// fixed on the left, a clear button that only appears once there's
// something to clear, matching the rest of this app's "only show a
// recovery/reset affordance when it's actually actionable" posture
// (EmptyState's onRetry, OfflineBanner).
export function SearchBar({ value, onChangeText, placeholder = "Search", autoFocus, onSubmitEditing }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color={theme.colors.mutedForeground} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => {
            haptics.light();
            onChangeText("");
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={theme.colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[2],
      minHeight: 44,
      paddingHorizontal: theme.space[4],
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      // Redesign Phase 5: readable input edge (--border-strong on web).
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    input: { flex: 1, fontSize: theme.text.base, color: theme.colors.foreground, paddingVertical: 0 },
  });
}
