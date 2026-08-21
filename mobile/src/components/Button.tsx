import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// One shared button shell for the new screens this upgrade adds (search,
// bookmarks, messages, community/business/marketplace/event actions) —
// previously every screen that needed a filled or bordered action button
// (edit-profile's save button, the post screen's send button, settings'
// sign-out) hand-rolled its own Pressable + style object. Matches those
// existing shapes exactly rather than introducing a third look: pill
// radius for primary/secondary (followButton's shape), rect radius.md for
// danger/ghost (signOutButton's shape) — haptics.light() on every press,
// same low-stakes-tap convention every other button in this app already
// follows.
export function Button({ label, onPress, variant = "primary", loading = false, disabled = false, accessibilityLabel, style }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDisabled = disabled || loading;

  // M9: scale adds the "feels expensive" press-down X/Instagram's own
  // buttons have; opacity keeps the instant dip the old style-function
  // form gave for free. Both driven from the same shared values (rather
  // than Pressable's own `style={({pressed}) => ...}` callback) because
  // AnimatedPressable intercepts the resolved `style` prop directly —
  // it never sees inside a function passed as that prop, so an animated
  // style can't be threaded through it. Skipped entirely under reduced
  // motion, same OS signal animateLayout.ts's LayoutAnimation gate reads
  // — Reanimated's own hook rather than that module's cached flag, since
  // a worklet needs a reactive value, not a snapshot read once.
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <AnimatedPressable
      onPress={() => {
        if (isDisabled) return;
        haptics.light();
        onPress();
      }}
      onPressIn={() => {
        if (isDisabled || reduceMotion) return;
        scale.value = withSpring(0.96, theme.motion.press);
        opacity.value = withSpring(0.75, theme.motion.press);
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        scale.value = withSpring(1, theme.motion.press);
        opacity.value = withSpring(1, theme.motion.press);
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        style,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? theme.colors.onAccent : theme.colors.accent} />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      minHeight: 48,
      paddingHorizontal: theme.space[6],
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: theme.space[2],
    },
    disabled: { opacity: 0.5 },
    label: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    primary: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.full },
    primaryLabel: { color: theme.colors.onAccent },
    secondary: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    secondaryLabel: { color: theme.colors.foreground },
    danger: { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radius.md },
    dangerLabel: { color: theme.colors.danger },
    ghost: { backgroundColor: "transparent", borderRadius: theme.radius.md },
    ghostLabel: { color: theme.colors.accent },
  });
}
