import { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme";

type Options = {
  // Button's press-down is more pronounced (0.96/0.75) than a list row's
  // (0.98/0.7, the defaults here) — callers that want Button's stronger
  // dip pass these explicitly rather than this hook picking one feel for
  // every tappable element in the app.
  scale?: number;
  opacity?: number;
};

// Extracted from Button.tsx/ListRow.tsx's identical shared-value +
// useAnimatedStyle boilerplate (M9) so every other Pressable in the app —
// PostRow's like/repost/bookmark, SettingsRow, Chip, FABs, send buttons —
// can get the same spring-driven press feedback instead of either a flat
// opacity-only style callback or no feedback at all. AnimatedPressable
// can't see inside a `style={({pressed}) => ...}` callback, hence the
// shared-value approach rather than that simpler-looking form.
export function usePressScale({ scale: scaleTo = 0.98, opacity: opacityTo = 0.7 }: Options = {}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  function onPressIn() {
    if (reduceMotion) return;
    scale.value = withSpring(scaleTo, theme.motion.press);
    opacity.value = withSpring(opacityTo, theme.motion.press);
  }

  function onPressOut() {
    if (reduceMotion) return;
    scale.value = withSpring(1, theme.motion.press);
    opacity.value = withSpring(1, theme.motion.press);
  }

  return { animatedStyle, onPressIn, onPressOut };
}
