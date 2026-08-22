import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import logoDark from "../../assets/logo-dark.png";
import logoLight from "../../assets/logo-light.png";

type Props = {
  uri: string | null | undefined;
  name: string | null | undefined;
  size?: number;
};

// Same fallback the web app's Avatar/Logo pair uses (see src/components/
// Avatar.tsx + Logo.tsx there) — the brand mark, not initials, and with the
// same deliberately-reversed dark/light pairing Logo.tsx documents: dark
// theme shows the dark-fill mark, light theme shows the light-fill mark.
// Keeps a missing avatarUrl looking the same "on-brand" way on both
// platforms instead of mobile inventing its own initials-circle look.
const LOGO_SOURCE = {
  dark: logoDark,
  light: logoLight,
};

// Shared by feed cards, notification rows, and the profile header — one
// avatar rendering rule (expo-image for disk/memory caching + blurhash-free
// fade-in, brand-mark fallback when no avatarUrl) instead of each screen
// re-deciding how to show a possibly-missing image.
export function Avatar({ uri, name, size = 40 }: Props) {
  const theme = useTheme();
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  const label = name ? `${name}'s avatar` : "Avatar";

  if (uri) {
    return (
      <Image source={{ uri }} style={dimension} contentFit="cover" transition={150} accessible alt={label} />
    );
  }

  return (
    <View style={[dimension, styles.fallback]} accessible accessibilityLabel={label}>
      <Image source={LOGO_SOURCE[theme.scheme]} style={{ width: size * 0.62, height: size * 0.62 }} contentFit="contain" alt="" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
});
