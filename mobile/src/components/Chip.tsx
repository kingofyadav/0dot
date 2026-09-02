import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

// Shared selectable pill — SegmentedControl composes these for its tabs,
// and it's reused directly for standalone filter/category tags
// (marketplace category, community tag) rather than each screen inventing
// its own selected/unselected pill styling.
//
// M15/D3: press feedback switched from a bare `pressed && { opacity }`
// style callback to the shared `usePressScale` hook Button/ListRow already
// use — same spring scale-dip and reduced-motion gate app-wide, instead of
// this one component feeling different under the finger.
export function Chip({ label, selected = false, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <AnimatedPressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected, animatedStyle]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </AnimatedPressable>
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
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.foreground },
    labelSelected: { color: theme.colors.onAccent },
  });
}
