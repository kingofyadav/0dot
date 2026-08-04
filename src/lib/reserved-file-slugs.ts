// Same shape as reserved-article-slugs.ts/reserved-book-slugs.ts —
// PublishedFile.slug is scoped per-profile, not a global namespace.
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_FILE_SLUGS = new Set<string>([]);

export type FileSlugValidationError = "invalid_format" | "reserved" | null;

export function validateFileSlugFormat(raw: string): FileSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 80,
    reservedWords: RESERVED_FILE_SLUGS,
  });
}
