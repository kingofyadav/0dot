import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View, type DimensionValue } from "react-native";
import { useTheme } from "../theme";

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
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <SkeletonBlock width={44} height={44} radius={22} />
      <View style={styles.rowBody}>
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width="90%" height={14} style={{ marginTop: 8 }} />
        <SkeletonBlock width="70%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, justifyContent: "center" },
});
