import { AccessibilityInfo, LayoutAnimation } from "react-native";

// AccessibilityInfo.isReduceMotionEnabled() is async, but animateNextLayout()
// needs a synchronous yes/no right before a setState call — so the flag is
// fetched once at module load and kept current via the change listener,
// rather than awaited per-call. Defaults to motion-enabled until the first
// fetch resolves, matching "no explicit preference known yet" rather than
// assuming reduced motion.
let reduceMotionEnabled = false;

AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
  reduceMotionEnabled = enabled;
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  reduceMotionEnabled = enabled;
});

// Call immediately before a setState that changes layout (loading -> loaded,
// item inserted/removed) to animate the transition instead of a hard cut.
// Mirrors the web app's blanket prefers-reduced-motion override — same
// principle, RN's own primitive.
export function animateNextLayout() {
  if (reduceMotionEnabled) return;
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
