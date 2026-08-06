// Badge-style cap (not k/M abbreviation) for like/repost/reply counts on
// posts — matches every other capped counter in the product (e.g. unread
// badges) rather than introducing a second, more precise number format.
export function formatCount(count: number): string {
  return count > 999 ? "999+" : String(count);
}
