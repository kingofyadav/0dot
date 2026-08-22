import { AccessibilityInfo, LayoutAnimation } from "react-native";

// AccessibilityInfo.isReduceMotionEnabled() is async, but animateNextLayout()
// needs a synchronous yes/no right before a setState call — so the flag is
// fetched once at module load and kept current via the change listener,
// rather than awaited per-call. Defaults to motion-enabled until the first
// fetch resolves, matching "no explicit preference known yet" rather than
// assuming reduced motion.
let osReduceMotionEnabled = false;
// M12: OR'd in from ThemePreferencesProvider (themePreferences.tsx) — the
// web app's own Preferences page has a reduce-motion toggle
// (accessibilityPrefsJson.reducedMotion) with no mobile equivalent by
// design (this OS-level signal already covers the same need here, so a
// second in-app toggle would just fight it — see that provider's own
// comment), but a preference set *there* should still take effect here:
// turning it on in either place reduces motion everywhere.
let webReduceMotionEnabled = false;

AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
  osReduceMotionEnabled = enabled;
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  osReduceMotionEnabled = enabled;
});

export function setWebReduceMotionPreference(enabled: boolean) {
  webReduceMotionEnabled = enabled;
}

// Call immediately before a setState that changes layout (loading -> loaded,
// item inserted/removed) to animate the transition instead of a hard cut.
// Mirrors the web app's blanket prefers-reduced-motion override — same
// principle, RN's own primitive.
export function animateNextLayout() {
  if (osReduceMotionEnabled || webReduceMotionEnabled) return;
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
