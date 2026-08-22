import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

// Extracted from the identical 44px circular arrow-up send button
// duplicated across post/[id].tsx's reply composer, messages/[id].tsx,
// and messages/new.tsx — each screen's own onSend already owns its
// haptic (fired on success, see messages/[id].tsx's own comment), so
// unlike FAB/StatButton this one doesn't fire haptics.light() itself on
// press, only the shared press-spring feedback.
export function SendButton({ onPress, disabled, accessibilityLabel = "Send" }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ scale: 0.9, opacity: 0.8 });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        if (!disabled) onPressIn();
      }}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.button, disabled && styles.buttonDisabled, animatedStyle]}
    >
      <Ionicons name="arrow-up" size={18} color={theme.colors.onAccent} />
    </AnimatedPressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: { backgroundColor: theme.colors.border },
  });
}
