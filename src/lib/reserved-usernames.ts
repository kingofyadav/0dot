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
  "s",
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
  "notifications",
  "r",
  "uploads",
  "qr",
  "0dot",
]);

import { validateSlugFormat } from "./slug-validation";

export type UsernameValidationError =
  | "invalid_format"
  | "reserved"
  | "taken"
  | null;

export function validateUsernameFormat(raw: string): UsernameValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 30,
    reservedWords: RESERVED_USERNAMES,
  });
}
