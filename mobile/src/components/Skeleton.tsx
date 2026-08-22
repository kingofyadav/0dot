import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, StyleSheet, View, type DimensionValue } from "react-native";
import { useTheme, type Theme } from "../theme";

// One shared pulsing placeholder, composed per-screen (feed/notifications/
// profile each arrange a few of these into their own card shape) instead of
// each screen re-implementing the animation loop.
export function SkeletonBlock({
  width,
  height,
  radius = 6,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: object;
}) {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.border, opacity },
        style,
      ]}
    />
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
