// spec §8: an ordered list of section keys with a per-section visibility
// toggle. Hand-rolled parse/validate, same posture as isValidThemePreset
// (theme-presets.ts) — no Zod anywhere in this codebase.
export const PORTFOLIO_SECTION_KEYS = [
  "projects",
  "resume",
  "skills",
  "repositories",
  "papers",
  "certificates",
  "awards",
] as const;

export type PortfolioSectionKey = (typeof PORTFOLIO_SECTION_KEYS)[number];

export type PortfolioLayoutEntry = { key: PortfolioSectionKey; visible: boolean };

export const PORTFOLIO_SECTION_LABELS: Record<PortfolioSectionKey, string> = {
  projects: "Projects",
  resume: "Resume",
  skills: "Skills",
  repositories: "Repositories",
  papers: "Research papers",
  certificates: "Certificates",
  awards: "Awards",
};

function isPortfolioSectionKey(value: unknown): value is PortfolioSectionKey {
  return typeof value === "string" && (PORTFOLIO_SECTION_KEYS as readonly string[]).includes(value);
}

function defaultLayout(): PortfolioLayoutEntry[] {
  return PORTFOLIO_SECTION_KEYS.map((key) => ({ key, visible: true }));
}

// Malformed/missing JSON falls back to the full default order, all visible
// — same "invalid input degrades to a safe default, never throws" posture
// isValidThemePreset uses. Any section key missing from a stored (possibly
// older) layout is appended at the end, visible — so a newly introduced
// section key doesn't silently disappear for an existing user's profile.
export function parsePortfolioLayout(raw: string | null): PortfolioLayoutEntry[] {
  if (!raw) return defaultLayout();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultLayout();
  }
  if (!Array.isArray(parsed)) return defaultLayout();

  const seen = new Set<PortfolioSectionKey>();
  const entries: PortfolioLayoutEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { key, visible } = item as { key?: unknown; visible?: unknown };
    if (!isPortfolioSectionKey(key) || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, visible: visible !== false });
  }
  for (const key of PORTFOLIO_SECTION_KEYS) {
    if (!seen.has(key)) entries.push({ key, visible: true });
  }
  return entries;
}

export function serializePortfolioLayout(entries: PortfolioLayoutEntry[]): string {
  return JSON.stringify(entries);
}
