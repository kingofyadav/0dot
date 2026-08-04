// Extracted from actions/profile.ts (originally private there) so
// phase-6 Projects' external_links can reuse the identical check instead of
// duplicating it — same allowlist-not-blocklist reasoning as uploads.ts.
export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    // Allowlist http/https only, rather than trying to blocklist every
    // dangerous scheme (javascript:, data:, etc.) — an allowlist can't be
    // bypassed by a scheme we forgot to blocklist.
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
