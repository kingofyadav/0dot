// Short relative-time labels ("2h", "3d") for feed/notification timestamps —
// matches the compact style typical of social feeds rather than a full
// locale string, which the full-detail screens (post/[id], settings' token
// expiry) still use via toLocaleString()/toLocaleTimeString().
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (diffSeconds < 60) return "now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
