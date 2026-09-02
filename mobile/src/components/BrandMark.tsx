import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";
import logoDark from "../../assets/logo-dark.png";
import logoLight from "../../assets/logo-light.png";

// The 0dot brand mark, shown as a rounded "app-icon" tile — the same
// asset + theme pairing Avatar's fallback uses (dark-fill mark in dark
// mode, light-fill mark in light mode), but framed as a tile with a
// hairline and soft shadow so the pre-login screens open on something
// that reads as *the app*, not a floating logo. An optional corner badge
// (the lock screen's padlock) sits over the bottom-right.
const LOGO_SOURCE = { dark: logoDark, light: logoLight };

export function BrandMark({
  size = 96,
  badge,
}: {
  size?: number;
  badge?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const badgeSize = Math.round(size * 0.42);

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.28 }, theme.shadow.md]}>
        <Image
          source={LOGO_SOURCE[theme.scheme]}
          style={{ width: size * 0.66, height: size * 0.66 }}
          contentFit="contain"
          alt=""
        />
      </View>
      {badge ? (
        <View
          style={[
            styles.badge,
            { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, borderColor: theme.colors.background },
          ]}
        >
          <Ionicons name={badge} size={badgeSize * 0.52} color={theme.colors.onAccent} />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    tile: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    badge: {
      position: "absolute",
      right: -4,
      bottom: -4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
      borderWidth: 3,
    },
  });
}
