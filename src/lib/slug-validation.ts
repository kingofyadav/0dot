// Shared core for every slug/handle namespace (usernames, community slugs,
// business slugs, ...). Each namespace keeps its own reserved-word Set and
// length bounds but funnels through this one regex/digit-only/reserved-word
// check, per phase-4 spec §16: "slug reservation/validation reuses the
// single shared source from Phase 1 §3.2" — this is its second reuse.
export type SlugValidationError = "invalid_format" | "reserved" | null;

export interface SlugValidationOptions {
  minLength: number;
  maxLength: number;
  reservedWords: Set<string>;
}

export function validateSlugFormat(
  raw: string,
  { minLength, maxLength, reservedWords }: SlugValidationOptions,
): SlugValidationError {
  const slug = raw.toLowerCase();
  const pattern = new RegExp(`^[a-z0-9_]{${minLength},${maxLength}}$`);
  if (!pattern.test(slug)) return "invalid_format";
  if (reservedWords.has(slug) || /^\d+$/.test(slug)) return "reserved";
  return null;
}
