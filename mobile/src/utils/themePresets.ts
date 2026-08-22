// Mirrors src/lib/theme-presets.ts's THEME_PRESETS (web) — mobile can't
// import a Next.js `@/lib/*` module (separate bundler/runtime), same
// "deliberate parallel copy" posture as countryCodes.ts. Only what the
// picker UI needs (key/label/swatch color/premiumOnly) — the server is
// still the source of truth for validity (isValidThemePreset, called from
// /api/v1/users/me's PATCH), this list only drives what's offered.
export type ThemePresetOption = { key: string; label: string; accent: string; premiumOnly?: boolean };

export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  { key: "default", label: "Classic", accent: "#4285f4" },
  { key: "sunset", label: "Sunset", accent: "#ff6b35" },
  { key: "ocean", label: "Ocean", accent: "#1e88e5" },
  { key: "forest", label: "Forest", accent: "#2f9e44" },
  { key: "midnight", label: "Midnight", accent: "#6b7fd7" },
  { key: "rose", label: "Rose", accent: "#e8578a" },
  { key: "gold", label: "Gold", accent: "#c9992c", premiumOnly: true },
  { key: "lavender", label: "Lavender", accent: "#8b6fd6", premiumOnly: true },
  { key: "emerald", label: "Emerald", accent: "#0f9d78", premiumOnly: true },
  { key: "coral", label: "Coral", accent: "#ff7a6e", premiumOnly: true },
  { key: "slate", label: "Slate", accent: "#5b6b7c", premiumOnly: true },
  { key: "amber", label: "Amber", accent: "#e8a33d", premiumOnly: true },
  { key: "berry", label: "Berry", accent: "#a83279", premiumOnly: true },
  { key: "teal", label: "Teal", accent: "#1a9c93", premiumOnly: true },
];
