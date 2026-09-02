import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme, type Theme } from "../theme";

// One shared placeholder, composed per-screen (feed/notifications/profile
// each arrange a few of these into their own card shape) instead of each
// screen re-implementing the animation loop.
//
// M15/D3: the flat opacity pulse became a moving highlight sweep (the
// "shimmer" every polished app's loading state has) — a LinearGradient
// band translated across the block via Reanimated. Falls back to the
// original opacity pulse when Reduce Motion is on, the same gate
// usePressScale/animateLayout already use. Default corner radius is now
// theme.radius.sm (was a bare `6`, matching no radius step).
export function SkeletonBlock({
  width,
  height,
  radius,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: object;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const cornerRadius = radius ?? theme.radius.sm;
  const [blockWidth, setBlockWidth] = useState(0);

  // Drives the sweep (0 → 1, translateX from off the left edge to off the
  // right) when motion is allowed, and the opacity pulse otherwise — one
  // shared value, one of two loops depending on the reduced-motion signal.
  const progress = useSharedValue(reduceMotion ? 0.35 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = withRepeat(withTiming(1, { duration: 650 }), -1, true);
    } else {
      progress.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    }
  }, [reduceMotion, progress]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? progress.value : 1 }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -blockWidth + progress.value * (blockWidth * 2) }],
  }));

  return (
    <Animated.View
      onLayout={(e) => setBlockWidth(e.nativeEvent.layout.width)}
      style={[
        { width, height, borderRadius: cornerRadius, backgroundColor: theme.colors.border, overflow: "hidden" },
        pulseStyle,
        style,
      ]}
    >
      {!reduceMotion && blockWidth > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
          <LinearGradient
            // A brightening band, not a color block — a translucent white
            // lift over the base fill so it reads as light passing across,
            // dimmer in dark mode where the same alpha would glare.
            colors={[
              "transparent",
              theme.scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.55)",
              "transparent",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function FeedRowSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <SkeletonBlock width={44} height={44} radius={22} />
      <View style={styles.rowBody}>
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width="90%" height={14} style={{ marginTop: theme.space[2] }} />
        <SkeletonBlock width="70%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// Matches ConversationRow's shape (48px avatar, name+time row, preview
// row) so the messages list skeleton doesn't jump in size once real rows
// replace it.
export function ConversationRowSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <SkeletonBlock width={48} height={48} radius={24} />
      <View style={styles.rowBody}>
        <View style={styles.spaceBetweenRow}>
          <SkeletonBlock width="40%" height={14} />
          <SkeletonBlock width={32} height={11} />
        </View>
        <SkeletonBlock width="80%" height={13} style={{ marginTop: theme.space[2] }} />
      </View>
    </View>
  );
}

// Matches UserRow's shape (44px avatar, name row, handle row).
export function UserRowSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <SkeletonBlock width={44} height={44} radius={22} />
      <View style={styles.rowBody}>
        <SkeletonBlock width="35%" height={14} />
        <SkeletonBlock width="25%" height={12} style={{ marginTop: theme.space[2] }} />
      </View>
    </View>
  );
}

// Matches SettingsRow's shape (icon + single label line, 48px min
// height) — the settings-family screens (sessions, privacy, preferences,
// notification-preferences, blocked-users) previously fell back to a bare
// ActivityIndicator on load while every content screen already got a
// shaped skeleton like the three above.
export function SettingsRowSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.settingsRow, { borderBottomColor: theme.colors.border }]}>
      <SkeletonBlock width={18} height={18} radius={4} />
      <SkeletonBlock width="50%" height={14} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: theme.space[3], padding: theme.space[4], borderBottomWidth: StyleSheet.hairlineWidth },
    rowBody: { flex: 1, justifyContent: "center" },
    spaceBetweenRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    settingsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      minHeight: 48,
      paddingHorizontal: theme.space[4],
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  });
}
