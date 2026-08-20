import { useWindowDimensions } from "react-native";

// iPad-class width and up. Matches this app's own supportsTablet: true
// (app.json) actually getting an adapted layout instead of a phone column
// stretched full-bleed across a much wider screen.
const TABLET_BREAKPOINT = 768;
// Caps a single-column feed/profile/post-detail layout at a comfortable
// reading width on a tablet — same "one centered column" posture the web
// app's own auth/profile cards already use (docs/DESIGN_SYSTEM.md's Grid
// section), not a from-scratch number.
const CONTENT_MAX_WIDTH = 680;

// Returns a maxWidth to constrain a screen's content to once the viewport
// is tablet-sized, or undefined on a phone (no constraint — full width,
// unchanged from before this hook existed).
export function useContentMaxWidth(): number | undefined {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT ? CONTENT_MAX_WIDTH : undefined;
}
