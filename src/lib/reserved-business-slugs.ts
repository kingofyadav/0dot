// Third namespace — business slugs live under /b/, separate from usernames
// (/) and community slugs (/c/), so a slug can't collide with either even if
// it's the same string. Mirrors reserved-community-slugs.ts's shape exactly
// (single shared reserved-word source, case-insensitive, thin wrapper around
// slug-validation.ts) rather than inventing a third policy shape.
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_BUSINESS_SLUGS = new Set([
  "new", // /b/new — the create-business route
  // phase-13 spec §8.1: 0dot's own brand terms and common confusable
  // variants — actively maintained as new confusables are identified.
  "0dot",
  "0dotin",
]);

export type BusinessSlugValidationError = "invalid_format" | "reserved" | "taken" | null;

export function validateBusinessSlugFormat(raw: string): BusinessSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 40, // phase-4 spec §3.1: 3-40 chars, same bounds as community slugs
    reservedWords: RESERVED_BUSINESS_SLUGS,
  });
}
