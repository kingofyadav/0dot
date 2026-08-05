// Sixth reuse of the shared slug policy (usernames, communities, businesses,
// projects, articles, now events) — global namespace like /c/, /b/, /p/,
// not owner-scoped like Article's per-author slugs.
import { validateSlugFormat } from "./slug-validation";

// phase-13 spec §8.1: 0dot's own brand terms and common confusable
// variants, alongside the create-event route — actively maintained as new
// confusables are identified.
export const RESERVED_EVENT_SLUGS = new Set<string>(["new", "0dot", "0dotin"]);

export type EventSlugValidationError = "invalid_format" | "reserved" | null;

export function validateEventSlugFormat(raw: string): EventSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 60,
    reservedWords: RESERVED_EVENT_SLUGS,
  });
}
