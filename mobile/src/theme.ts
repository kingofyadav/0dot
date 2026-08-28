import { useColorScheme } from "react-native";
import { useThemePreferences, type ThemePrefs } from "./themePreferences";

// Mirrors src/app/globals.css / docs/DESIGN_SYSTEM.md on the web app
// exactly (light/dark hex values, spacing, radius, type scale) rather than
// inventing a second palette for the mobile client — same Google 4-color
// system (Blue primary interactive, Red/Yellow/Green reserved for status
// only, never decorative). rem values there are converted to px here
// (React Native has no rem) at the same 16px base the web app's root font
// size uses.

export type Theme = {
  scheme: "light" | "dark";
  colors: {
    background: string;
    foreground: string;
    surface: string;
    // Redesign Phase 5 (docs/specs/phase-0-redesign.md §6): mirrors the web
    // --surface-2 (a foreground-derived inset step — nested regions) and
    // --border-strong (the readable card/input edge; --border stays the
    // near-invisible hairline for dividers). Concrete px/hex here since RN
    // has no color-mix().
    surface2: string;
    border: string;
    borderStrong: string;
    mutedForeground: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    onAccent: string;
    success: string;
    successSoft: string;
    onSuccess: string;
    warning: string;
    warningSoft: string;
    onWarning: string;
    danger: string;
    dangerSoft: string;
    onDanger: string;
  };
  space: { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number; 8: number; 10: number; 12: number; 16: number };
  radius: { sm: number; md: number; lg: number; full: number };
  text: { xs: number; sm: number; base: number; lg: number; xl: number; xxl: number };
  weight: { regular: "400"; label: "500"; emphasis: "600"; heading: "700" };
  shadow: { sm: ShadowStyle; md: ShadowStyle; lg: ShadowStyle };
  motion: { fast: number; base: number; slow: number; press: { damping: number; stiffness: number } };
};

// RN's shadow props (iOS) can't express web's dual-layer box-shadow
// (--shadow/-md/-lg are each two stacked layers) without a nested view per
// layer — this approximates each tier with its more visually dominant
// (larger blur/offset) layer, tuned against the same rgba alpha web uses,
// plus an elevation number for Android (which has no opacity/blur control
// of its own, only a depth integer) scaled to land in the same sm<md<lg
// order. Values, not a shared type export — RN's ViewStyle already covers
// the shape callers need.
type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
const radius = { sm: 8, md: 10, lg: 16, full: 9999 } as const;
const text = { xs: 12.8, sm: 14.4, base: 16, lg: 17.6, xl: 22.4, xxl: 25.6 } as const;
const weight = { regular: "400", label: "500", emphasis: "600", heading: "700" } as const;
// Mirrors globals.css's --transition-fast/-base/-slow (0.05s/0.15s/0.25s)
// converted to the millisecond durations RN's Animated/LayoutAnimation
// timing functions take, rather than each new screen picking its own
// duration by feel.
// M9: one shared spring tuning for every Reanimated press-scale effect
// (Button, ListRow) so a future retune doesn't need finding every call
// site by hand — damping/stiffness rather than a duration since
// withSpring is physics-driven, unlike fast/base/slow above.
const motion = { fast: 50, base: 150, slow: 250, press: { damping: 18, stiffness: 400 } } as const;

// Mirrors globals.css's --shadow/-md/-lg light values (see that file's
// light-mode custom properties) — see ShadowStyle's comment for the
// single-layer approximation this makes.
const lightShadow: Theme["shadow"] = {
  sm: { shadowColor: "#171717", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: "#171717", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 6 },
  lg: { shadowColor: "#171717", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 16 },
};

// Mirrors globals.css's --_dark-shadow/-md/-lg values.
const darkShadow: Theme["shadow"] = {
  sm: { shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  lg: { shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 16 },
};

// Near-black text (#171717) clears WCAG AA against every accent/success/
// warning/danger fill in both themes — globals.css's --on-accent/
// --on-success/--on-warning/--on-danger, all verified there per-color
// rather than assumed.
const onColor = "#171717";

const light: Theme = {
  scheme: "light",
  colors: {
    background: "#f5f4f1",
    foreground: "#171717",
    surface: "#fbfaf8",
    surface2: "#f2f1ef",
    border: "rgba(23, 23, 23, 0.12)",
    borderStrong: "rgba(23, 23, 23, 0.2)",
    mutedForeground: "#666666",
    accent: "#4285f4",
    accentStrong: "#1a73e8",
    accentSoft: "rgba(66, 133, 244, 0.14)",
    onAccent: onColor,
    success: "#34a853",
    successSoft: "rgba(52, 168, 83, 0.14)",
    onSuccess: onColor,
    warning: "#fbbc04",
    warningSoft: "rgba(251, 188, 4, 0.14)",
    onWarning: onColor,
    danger: "#ea4335",
    dangerSoft: "rgba(234, 67, 53, 0.14)",
    onDanger: onColor,
  },
  space,
  radius,
  text,
  weight,
  shadow: lightShadow,
  motion,
};

const dark: Theme = {
  scheme: "dark",
  colors: {
    background: "#0a0a0a",
    foreground: "#ededed",
    surface: "#131313",
    surface2: "#1c1c1c",
    border: "rgba(237, 237, 237, 0.12)",
    borderStrong: "rgba(237, 237, 237, 0.18)",
    mutedForeground: "#a0a0a0",
    accent: "#8ab4f8",
    accentStrong: "#669df6",
    accentSoft: "rgba(138, 180, 248, 0.18)",
    onAccent: onColor,
    success: "#81c995",
    successSoft: "rgba(129, 201, 149, 0.18)",
    onSuccess: onColor,
    warning: "#fbbc04",
    warningSoft: "rgba(251, 188, 4, 0.18)",
    onWarning: onColor,
    danger: "#f28b82",
    dangerSoft: "rgba(242, 139, 130, 0.18)",
    onDanger: onColor,
  },
  space,
  radius,
  text,
  weight,
  shadow: darkShadow,
  motion,
};

// M12 (settings/account parity): font-scale/high-contrast overrides,
// mirroring globals.css's own html[data-font-scale]/[data-high-contrast]
// rules exactly (same 112.5%/125% scale steps, same per-scheme override
// colors) — a bounded set of token overrides, not a second theme, same
// posture that CSS's own comment states. Applied as a pure function over
// the existing static light/dark objects rather than a third palette, so
// every other value (space/radius/shadow/motion) stays shared.
const FONT_SCALE_MULTIPLIER: Record<ThemePrefs["fontScale"], number> = { default: 1, large: 1.125, larger: 1.25 };

function scaleText(t: Theme["text"], multiplier: number): Theme["text"] {
  return {
    xs: t.xs * multiplier,
    sm: t.sm * multiplier,
    base: t.base * multiplier,
    lg: t.lg * multiplier,
    xl: t.xl * multiplier,
    xxl: t.xxl * multiplier,
  };
}

function applyThemePrefs(base: Theme, prefs: ThemePrefs): Theme {
  if (prefs.fontScale === "default" && !prefs.highContrast) return base;

  const colors = prefs.highContrast
    ? {
        ...base.colors,
        ...(base.scheme === "dark"
          ? { foreground: "#ffffff", mutedForeground: "#f0f0f0", border: "#ffffff", borderStrong: "#ffffff" }
          : { foreground: "#000000", mutedForeground: "#1a1a1a", border: "#000000", borderStrong: "#000000" }),
      }
    : base.colors;

  return { ...base, colors, text: scaleText(base.text, FONT_SCALE_MULTIPLIER[prefs.fontScale]) };
}

export function useTheme(): Theme {
  const base = useColorScheme() === "dark" ? dark : light;
  const prefs = useThemePreferences();
  return applyThemePrefs(base, prefs);
}
