import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

type Props = {
  uri: string | null | undefined;
  name: string | null | undefined;
  size?: number;
};

// Shared by feed cards, notification rows, and the profile header — one
// avatar rendering rule (expo-image for disk/memory caching + blurhash-free
// fade-in, initials fallback when no avatarUrl) instead of each screen
// re-deciding how to show a possibly-missing image.
export function Avatar({ uri, name, size = 40 }: Props) {
  const theme = useTheme();
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={dimension}
        contentFit="cover"
        transition={150}
        accessible
        accessibilityLabel={name ? `${name}'s avatar` : "Avatar"}
      />
    );
  }

  return (
    <View
      style={[dimension, styles.fallback, { backgroundColor: theme.colors.accentSoft }]}
      accessible
      accessibilityLabel={name ? `${name}'s avatar` : "Avatar"}
    >
      <Text style={[styles.initial, { color: theme.colors.accentStrong, fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "700" },
});
