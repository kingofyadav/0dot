import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

// Shared selectable pill — SegmentedControl composes these for its tabs,
// and it's reused directly for standalone filter/category tags
// (marketplace category, community tag) in later sub-phases rather than
// each screen inventing its own selected/unselected pill styling.
export function Chip({ label, selected = false, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chip: {
      minHeight: 36,
      paddingHorizontal: theme.space[4],
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    pressed: { opacity: 0.7 },
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.foreground },
    labelSelected: { color: theme.colors.onAccent },
  });
}
