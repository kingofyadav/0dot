// Single shared reserved-word source for the username namespace.
// Per Phase 1 spec §3.2: this must be the one place any router/validator
// checks, so a reserved word can never be claimed even if new routes are
// added later.
export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "www",
  "help",
  "settings",
  "about",
  "feed",
  "explore",
  "trending",
  "c",
  "b",
  "p",
  "e",
  "jobs",
  "store",
  "blog",
  "developers",
  "login",
  "signup",
  "logout",
  "verify",
  "claim-username",
  "search",
  "bookmarks",
  "r",
  "uploads",
  "0dot",
]);

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export type UsernameValidationError =
  | "invalid_format"
  | "reserved"
  | "taken"
  | null;

export function validateUsernameFormat(raw: string): UsernameValidationError {
  const handle = raw.toLowerCase();
  if (!USERNAME_PATTERN.test(handle)) return "invalid_format";
  if (RESERVED_USERNAMES.has(handle) || /^\d+$/.test(handle)) return "reserved";
  return null;
}
