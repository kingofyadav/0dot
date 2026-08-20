import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";
import { relativeTime } from "../utils/relativeTime";

// Shown instead of a hard error screen when a fetch fails but a previous
// successful load left something cached (offlineCache.ts) — per
// docs/DESIGN_SYSTEM.md, --warning is never rendered as bare colored text
// (fails AA in light mode), so this is a filled warningSoft badge with
// foreground-colored text, not a colored label.
export function OfflineBanner({ cachedAt }: { cachedAt: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.warningSoft }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.warning} />
      <Text style={[styles.text, { color: theme.colors.foreground }]}>You're offline — showing posts saved {relativeTime(new Date(cachedAt).toISOString())}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
  text: { fontSize: 12.8, flex: 1 },
});
