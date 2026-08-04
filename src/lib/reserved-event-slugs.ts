// Sixth reuse of the shared slug policy (usernames, communities, businesses,
// projects, articles, now events) — global namespace like /c/, /b/, /p/,
// not owner-scoped like Article's per-author slugs.
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_EVENT_SLUGS = new Set<string>(["new"]);

export type EventSlugValidationError = "invalid_format" | "reserved" | null;

export function validateEventSlugFormat(raw: string): EventSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 60,
    reservedWords: RESERVED_EVENT_SLUGS,
  });
}
