// Mirrors the web app's src/lib/format.ts `formatCount` exactly — a
// badge-style cap (not k/M abbreviation) for like/repost/reply counts on
// posts, so a viral post's action row shows "999+" rather than an
// eight-digit number that blows out the row width. Kept as its own tiny
// module (not inlined) because PostRow and the post-detail screen both
// render the same stats row and must agree.
export function formatCount(count: number): string {
  return count > 999 ? "999+" : String(count);
}
