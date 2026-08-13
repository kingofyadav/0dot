import Link from "next/link";
import type { ReactNode } from "react";

// Lightweight, render-time-only hashtag/mention styling — no Hashtag/Mention
// tables yet (that's real search-index work for a later pass). Mentions
// link optimistically to /handle without checking the account exists; a
// stale mention just 404s, which is an acceptable gap for this iteration.
const TOKEN_PATTERN = /([#@][a-zA-Z0-9_]{1,30})/g;
const MENTION_PATTERN = /@([a-zA-Z0-9_]{1,30})/g;
const MAX_MENTIONS_PER_POST = 10;

// Server-side extraction for notification producers (createPost,
// createQuoteRepost) — same parsing concern as TOKEN_PATTERN above, kept
// in this one file so the two regexes can't drift apart. Deliberately not
// persisted as a Mention table (Phase 1 chose not to build one and nothing
// here needs it queryable later, just resolved once at write time).
// Deduped, lowercased, capped — same defensive-cap posture as
// MAX_MEDIA_PER_POST, guards against mentioning hundreds of handles to
// spam notifications. Does not verify the handle actually resolves to a
// real user — that's the caller's job (resolving against Username).
export function extractMentionedHandles(body: string): string[] {
  const handles = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    handles.add(match[1].toLowerCase());
    if (handles.size >= MAX_MENTIONS_PER_POST) break;
  }
  return [...handles];
}

// Twitter-style body clipping so one very long post doesn't dominate the
// feed — cuts at the nearest preceding space so "Show more" never splits a
// word (or a @mention/#hashtag token) in half. Splitting on the raw string
// before linkifying means an @mention/link straddling the cut point can
// still get separated across shown/rest; accepted, same as the pre-
// existing 500-char createPost/editPost limit already truncating mid-token
// in the worst case.
export function splitPostBody(body: string, limit = 280): { shown: string; rest: string | null } {
  if (body.length <= limit) return { shown: body, rest: null };
  const cut = body.lastIndexOf(" ", limit);
  return { shown: body.slice(0, cut > 0 ? cut : limit), rest: body.slice(cut > 0 ? cut : limit) };
}

export function linkifyPostBody(body: string): ReactNode[] {
  const parts = body.split(TOKEN_PATTERN);

  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      const handle = part.slice(1).toLowerCase();
      return (
        <Link
          key={index}
          href={`/${handle}`}
          style={{ color: "var(--accent)", fontWeight: 600 }}
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith("#")) {
      return (
        <span key={index} style={{ color: "var(--accent)", fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    return part;
  });
}
