import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

// Shared by the settings screen's navigable rows (edit profile,
// notification preferences, connected apps) — a plain icon/label/chevron
// row, distinct from ListRow (which is post/notification list items, not
// settings navigation).
export function SettingsRow({ icon, label, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.mutedForeground} />
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      minHeight: 48,
      paddingHorizontal: theme.space[4],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    label: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.base },
  });
}
