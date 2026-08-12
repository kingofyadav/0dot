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
  // premium-profiles addendum §3.4/§2: a larger *curated* library for
  // premium, never a door into raw CSS/HTML — every preset, free or
  // premium, is still just a key into this fixed list and its three
  // accent tokens.
  premiumOnly?: boolean;
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
  // premium-only presets below — same token schema as every free preset
  // above, just more of them.
  { key: "gold", label: "Gold", accent: "#c9992c", accentStrong: "#a37a1f", accentSoft: "rgba(201, 153, 44, 0.16)", premiumOnly: true },
  { key: "lavender", label: "Lavender", accent: "#8b6fd6", accentStrong: "#6f52b8", accentSoft: "rgba(139, 111, 214, 0.16)", premiumOnly: true },
  { key: "emerald", label: "Emerald", accent: "#0f9d78", accentStrong: "#0b7a5e", accentSoft: "rgba(15, 157, 120, 0.14)", premiumOnly: true },
  { key: "coral", label: "Coral", accent: "#ff7a6e", accentStrong: "#e05a4d", accentSoft: "rgba(255, 122, 110, 0.14)", premiumOnly: true },
  { key: "slate", label: "Slate", accent: "#5b6b7c", accentStrong: "#42505e", accentSoft: "rgba(91, 107, 124, 0.16)", premiumOnly: true },
  { key: "amber", label: "Amber", accent: "#e8a33d", accentStrong: "#c4842a", accentSoft: "rgba(232, 163, 61, 0.16)", premiumOnly: true },
  { key: "berry", label: "Berry", accent: "#a83279", accentStrong: "#84255e", accentSoft: "rgba(168, 50, 121, 0.15)", premiumOnly: true },
  { key: "teal", label: "Teal", accent: "#1a9c93", accentStrong: "#137d76", accentSoft: "rgba(26, 156, 147, 0.15)", premiumOnly: true },
];

const PRESET_KEYS = new Set(THEME_PRESETS.map((p) => p.key));
const PREMIUM_PRESET_KEYS = new Set(THEME_PRESETS.filter((p) => p.premiumOnly).map((p) => p.key));

export function isValidThemePreset(key: string, isPremium: boolean): boolean {
  if (!PRESET_KEYS.has(key)) return false;
  if (PREMIUM_PRESET_KEYS.has(key) && !isPremium) return false;
  return true;
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
  "reddit",
  "threads",
  "snapchat",
  "telegram",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Display label per platform — a plain capitalized key ("twitter" ->
// "Twitter") is wrong for the one platform that rebranded to a name that
// doesn't derive from its stored key ("twitter" -> "X"), so every platform
// gets an explicit label rather than mixing a derived-label rule with a
// one-off exception.
const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  twitter: "X",
  instagram: "Instagram",
  github: "GitHub",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  website: "Website",
  reddit: "Reddit",
  threads: "Threads",
  snapchat: "Snapchat",
  telegram: "Telegram",
};

export function getSocialPlatformLabel(platform: string): string {
  return SOCIAL_PLATFORM_LABELS[platform as SocialPlatform] ?? platform;
}
