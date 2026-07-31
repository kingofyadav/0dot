// Fixed palette — a flair's color is a key into this list, validated
// server-side, never free-form CSS (phase-3 spec §6, same reasoning as
// src/lib/theme-presets.ts's accent colors: customization without an XSS
// or accessibility-contrast surface).
export type FlairColorOption = { key: string; label: string; background: string; foreground: string };

export const FLAIR_COLORS: FlairColorOption[] = [
  { key: "gray", label: "Gray", background: "rgba(128, 128, 128, 0.16)", foreground: "#5a5a5a" },
  { key: "red", label: "Red", background: "rgba(229, 62, 62, 0.14)", foreground: "#c53030" },
  { key: "orange", label: "Orange", background: "rgba(255, 107, 53, 0.14)", foreground: "#c2410c" },
  { key: "yellow", label: "Yellow", background: "rgba(217, 164, 6, 0.16)", foreground: "#92660a" },
  { key: "green", label: "Green", background: "rgba(47, 158, 68, 0.14)", foreground: "#237a35" },
  { key: "blue", label: "Blue", background: "rgba(30, 136, 229, 0.14)", foreground: "#1567b3" },
  { key: "purple", label: "Purple", background: "rgba(139, 92, 246, 0.16)", foreground: "#6d28d9" },
  { key: "pink", label: "Pink", background: "rgba(236, 72, 153, 0.14)", foreground: "#be185d" },
];

export const FLAIR_COLOR_KEYS = new Set(FLAIR_COLORS.map((c) => c.key));

export const MAX_FLAIRS_PER_COMMUNITY = 15;

export function flairColorStyle(key: string): { background: string; color: string } {
  const preset = FLAIR_COLORS.find((c) => c.key === key) ?? FLAIR_COLORS[0];
  return { background: preset.background, color: preset.foreground };
}
