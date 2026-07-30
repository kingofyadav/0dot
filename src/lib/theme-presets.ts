// Fixed preset system — an accent-color override applied inline, scoped to
// .profileCard only. Never raw CSS/HTML: a profile's themePreset is a key
// into this list, validated server-side, never user-supplied style text.
// See phase-1 spec §3.6.
export type ThemePreset = {
  key: string;
  label: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "default",
    label: "Classic",
    accent: "var(--accent)",
    accentStrong: "var(--accent-strong)",
    accentSoft: "var(--accent-soft)",
  },
  {
    key: "sunset",
    label: "Sunset",
    accent: "#ff6b35",
    accentStrong: "#e5502a",
    accentSoft: "rgba(255, 107, 53, 0.14)",
  },
  {
    key: "ocean",
    label: "Ocean",
    accent: "#1e88e5",
    accentStrong: "#1567b3",
    accentSoft: "rgba(30, 136, 229, 0.14)",
  },
  {
    key: "forest",
    label: "Forest",
    accent: "#2f9e44",
    accentStrong: "#237a35",
    accentSoft: "rgba(47, 158, 68, 0.14)",
  },
  {
    key: "midnight",
    label: "Midnight",
    accent: "#6b7fd7",
    accentStrong: "#4e5fb8",
    accentSoft: "rgba(107, 127, 215, 0.16)",
  },
  {
    key: "rose",
    label: "Rose",
    accent: "#e8578a",
    accentStrong: "#c93f6f",
    accentSoft: "rgba(232, 87, 138, 0.14)",
  },
];

const PRESET_KEYS = new Set(THEME_PRESETS.map((p) => p.key));

export function isValidThemePreset(key: string): boolean {
  return PRESET_KEYS.has(key);
}

export function getThemePreset(key: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.key === key) ?? THEME_PRESETS[0];
}

// http(s)-only (see isSafeUrl in actions/profile.ts) — no mailto:/tel:
// platforms, to keep URL validation a single consistent rule.
export const SOCIAL_PLATFORMS = [
  "twitter",
  "instagram",
  "github",
  "linkedin",
  "youtube",
  "tiktok",
  "facebook",
  "website",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
