// Mobile pro-upgrade addendum, sub-phase M13 — mirrors web's
// PresenceStatus.tsx formatLastActive exactly (same thresholds/copy), so
// "Active 5m ago" reads identically on both clients rather than inventing
// a second relative-time phrasing for presence specifically (relativeTime.ts
// already covers the generic case elsewhere; presence's own copy — "Active
// now" vs. a plain timestamp — doesn't fit that shared helper).
export function formatLastActive(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Active just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return `Active ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
