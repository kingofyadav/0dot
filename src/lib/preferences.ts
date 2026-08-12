// addendum §11: curated small lists, not a full IANA/locale database, same
// posture as this app's other curated lists (e.g. PUSH_NOTIFICATION_TYPES).
// Plain data, not colocated in actions/preferences.ts — a "use server" file
// may only export async functions, so a client component importing a const
// array from one gets a broken server-action reference instead of the
// actual array at runtime.
export const LOCALES = ["en-US", "en-GB", "en-IN", "es-ES", "fr-FR", "de-DE", "pt-BR", "hi-IN", "ja-JP", "zh-CN"] as const;

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;
