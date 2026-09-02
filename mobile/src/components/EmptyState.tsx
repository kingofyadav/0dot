import { useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  /** @deprecated use `title` — kept so existing call sites keep working. */
  message?: string;
  title?: string;
  description?: string;
  /** A primary action (e.g. a <Button>) for a designed — not error — empty state. */
  action?: ReactNode;
  /** Error-recovery affordance: renders a "Try again" button. */
  onRetry?: () => void;
};

// Shared by every screen's empty/error list state. Redesign Phase 5
// (docs/specs/phase-0-redesign.md §5) brought it to parity with the web
// EmptyState: the icon sits in a soft accent disc, `message` became the
// foreground title with an optional muted `description` line, and an
// `action` slot for a designed empty state. `onRetry` stays for the real
// error case (a dropped connection, a 5xx) the user otherwise had no
// prompt to recover from.
export function EmptyState({ icon, message, title, description, action, onRetry }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const heading = title ?? message;
  // M15/D3: the retry button used a bare `pressed ? 0.6 : 1` opacity
  // callback — now the same shared spring press feedback every other
  // pressable in the app uses.
  const retryPress = usePressScale();

  return (
    <View style={styles.container}>
      <View style={styles.iconDisc}>
        <Ionicons name={icon} size={24} color={theme.colors.accent} />
      </View>
      {heading ? <Text style={styles.title}>{heading}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
      {onRetry ? (
        <AnimatedPressable
          onPress={() => {
            haptics.light();
            onRetry();
          }}
          onPressIn={retryPress.onPressIn}
          onPressOut={retryPress.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={[styles.retryButton, retryPress.animatedStyle]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[8], gap: theme.space[2] },
    iconDisc: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.space[2],
    },
    title: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis, textAlign: "center", color: theme.colors.foreground },
    description: {
      fontSize: theme.text.sm,
      lineHeight: theme.text.sm * 1.55,
      textAlign: "center",
      color: theme.colors.mutedForeground,
      maxWidth: 320,
    },
    action: { marginTop: theme.space[3] },
    retryButton: {
      marginTop: theme.space[3],
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.full,
      paddingVertical: theme.space[3],
      paddingHorizontal: theme.space[5],
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    retryText: { fontWeight: theme.weight.emphasis, fontSize: theme.text.sm, color: theme.colors.accent },
  });
}
