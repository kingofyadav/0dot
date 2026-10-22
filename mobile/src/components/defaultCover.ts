import defaultCoverLight from "../../assets/default-cover-light.jpg";
import defaultCoverDark from "../../assets/default-cover-dark.jpg";

// Mirrors src/app/[username]/page.tsx's default cover on the web app — the
// same two images, theme-swapped the same way (natural pairing: the dark
// cover in dark mode), shown as a display-time fallback when coverUrl is
// null and never written back to the profile. RN has no CSS display toggle,
// so callers pass the active scheme (theme.scheme) and get the right source.
//
// Return type is the Metro-resolved asset id (types/images.d.ts), not RN's
// ImageSourcePropType — callers pass this straight into expo-image's Image,
// whose `source` prop has its own (wider but differently-shaped) type, and
// a bare `number` is a valid member of both.
export function defaultCoverSource(scheme: "light" | "dark"): number {
  return scheme === "dark" ? defaultCoverDark : defaultCoverLight;
}
