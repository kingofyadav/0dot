import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
};

// Extracted from Home's and Messages' identical bottom-right compose FABs
// (same size/position/shadow, previously each screen's own copy) — also
// gives the FAB the same usePressScale spring every other primary CTA in
// the app now has, instead of the plain opacity dip it had before.
export function FAB({ icon, accessibilityLabel, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ scale: 0.92, opacity: 0.85 });

  return (
    <AnimatedPressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.fab, animatedStyle]}
    >
      <Ionicons name={icon} size={26} color={theme.colors.onAccent} />
    </AnimatedPressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fab: {
      position: "absolute",
      right: theme.space[5],
      bottom: theme.space[5],
      width: 56,
      height: 56,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
  });
}
