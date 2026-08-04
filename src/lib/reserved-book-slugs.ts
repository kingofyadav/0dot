// Same shape as reserved-article-slugs.ts — Book.slug is scoped per-profile
// (@@unique([profileId, slug])), not a global namespace, so there's no
// cross-author collision to guard against; kept as a thin validateSlugFormat
// wrapper for the shared format rules anyway.
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_BOOK_SLUGS = new Set<string>([]);

export type BookSlugValidationError = "invalid_format" | "reserved" | null;

export function validateBookSlugFormat(raw: string): BookSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 80,
    reservedWords: RESERVED_BOOK_SLUGS,
  });
}
