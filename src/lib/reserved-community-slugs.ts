// Separate namespace from src/lib/reserved-usernames.ts — community slugs
// live under /c/, usernames under /, so a slug and a handle can't collide
// even if they're the same string (phase-3 spec §3.2: "Community slugs and
// usernames are in separate namespaces"). Mirrors that file's approach
// (single shared reserved-word source, case-insensitive, one place any
// router/validator checks) rather than inventing a second policy shape.
export const RESERVED_COMMUNITY_SLUGS = new Set([
  "new", // /c/new — the create-community route
  // phase-13 spec §8.1: 0dot's own brand terms and common confusable
  // variants — actively maintained as new confusables are identified, not
  // frozen at this list.
  "0dot",
  "0dotin",
]);

import { validateSlugFormat } from "./slug-validation";

export type CommunitySlugValidationError = "invalid_format" | "reserved" | "taken" | null;

export function validateCommunitySlugFormat(raw: string): CommunitySlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 40, // phase-3 spec §3.1: 3-40 chars (vs. 3-30 for usernames)
    reservedWords: RESERVED_COMMUNITY_SLUGS,
  });
}
