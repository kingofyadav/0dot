// Fourth namespace to reuse the shared slug policy — project slugs live
// under /p/, separate from usernames (/), community slugs (/c/), and
// business slugs (/b/). Mirrors reserved-business-slugs.ts's shape exactly
// (single shared reserved-word source, case-insensitive, thin wrapper
// around slug-validation.ts).
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_PROJECT_SLUGS = new Set([
  "new", // /p/new — the create-project route
  // phase-13 spec §8.1: 0dot's own brand terms and common confusable
  // variants — actively maintained as new confusables are identified.
  "0dot",
  "0dotin",
]);

export type ProjectSlugValidationError = "invalid_format" | "reserved" | "taken" | null;

export function validateProjectSlugFormat(raw: string): ProjectSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 60, // phase-6 spec §3.1: 3-60 chars
    reservedWords: RESERVED_PROJECT_SLUGS,
  });
}
