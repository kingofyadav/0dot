import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// Shared by the feed and notifications rows (and any future tappable list
// row) so the press-opacity/hairline-border/padding shell — previously
// hand-duplicated per screen with the same values — lives in one place.
// Each screen still owns its own inner layout (byline, stats row, icon
// badge, etc.), just not this wrapper.
//
// M9: press feedback moved from Pressable's own `style={({pressed}) => ...}`
// callback to a Reanimated shared-value pair (same reasoning as Button's
// own version of this change — AnimatedPressable can't see inside that
// callback), gaining a small scale spring alongside the opacity dip every
// row across the app already had.
export function ListRow({ onPress, accessibilityLabel, highlighted, style, children }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => {
        if (reduceMotion) return;
        scale.value = withSpring(0.98, theme.motion.press);
        opacity.value = withSpring(0.7, theme.motion.press);
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        scale.value = withSpring(1, theme.motion.press);
        opacity.value = withSpring(1, theme.motion.press);
      }}
      style={[
        styles.row,
        { borderBottomColor: theme.colors.border },
        highlighted ? { backgroundColor: theme.colors.accentSoft } : null,
        style,
        animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
