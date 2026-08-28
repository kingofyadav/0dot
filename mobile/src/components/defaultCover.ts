import type { ImageSourcePropType } from "react-native";
import defaultCoverLight from "../../assets/default-cover-light.jpg";
import defaultCoverDark from "../../assets/default-cover-dark.jpg";

// Mirrors src/app/[username]/page.tsx's default cover on the web app — the
// same two images, theme-swapped the same way (natural pairing: the dark
// cover in dark mode), shown as a display-time fallback when coverUrl is
// null and never written back to the profile. RN has no CSS display toggle,
// so callers pass the active scheme (theme.scheme) and get the right source.
export function defaultCoverSource(scheme: "light" | "dark"): ImageSourcePropType {
  return scheme === "dark" ? defaultCoverDark : defaultCoverLight;
}
