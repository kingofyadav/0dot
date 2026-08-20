import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import type { PostMedia } from "../api/types";

// Shared by the feed row and post detail screen. Simple equal-width row
// (not a mosaic grid) — a real per-count layout (1 full-width, 2 side by
// side, 3 one-large-two-small, etc., the way most social apps do it) is
// its own small design effort, deferred rather than approximated badly
// here.
export function PostMediaGrid({ media, height = 160 }: { media: PostMedia[]; height?: number }) {
  const theme = useTheme();
  if (media.length === 0) return null;
  return (
    <View style={[styles.grid, { height, borderRadius: theme.radius.md, borderColor: theme.colors.border }]}>
      {media.map((item) => (
        <Image key={item.url} source={{ uri: item.url }} style={styles.image} contentFit="cover" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 2, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  image: { flex: 1, height: "100%" },
});
