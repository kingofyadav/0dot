// Fifth reuse of the shared slug policy (usernames, communities, businesses,
// projects, now articles) — but unlike those four, article slugs are scoped
// per-author (@@unique([authorId, slug]) on Article), not a single global
// namespace, so there's no cross-author collision to guard against. Kept as
// a thin wrapper around validateSlugFormat anyway for the same format rules
// (lowercase/digits/underscore, length bounds) and so a reserved word can be
// added later without changing every call site.
import { validateSlugFormat } from "./slug-validation";

export const RESERVED_ARTICLE_SLUGS = new Set<string>([]);

export type ArticleSlugValidationError = "invalid_format" | "reserved" | null;

export function validateArticleSlugFormat(raw: string): ArticleSlugValidationError {
  return validateSlugFormat(raw, {
    minLength: 3,
    maxLength: 80,
    reservedWords: RESERVED_ARTICLE_SLUGS,
  });
}
