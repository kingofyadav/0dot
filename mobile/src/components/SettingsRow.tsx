import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

// Shared by the settings screen's navigable rows (edit profile,
// notification preferences, connected apps) — a plain icon/label/chevron
// row, distinct from ListRow (which is post/notification list items, not
// settings navigation). Ported onto the same usePressScale spring +
// haptic every other tappable row in the app now uses — this one never
// got the M9 upgrade ListRow/Button did, so it read flatter than the rest
// of the app.
export function SettingsRow({ icon, label, onPress }: Props) {
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
      style={[styles.row, animatedStyle]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.mutedForeground} />
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
    </AnimatedPressable>
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
