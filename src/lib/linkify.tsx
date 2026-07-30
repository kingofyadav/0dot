import Link from "next/link";
import type { ReactNode } from "react";

// Lightweight, render-time-only hashtag/mention styling — no Hashtag/Mention
// tables yet (that's real search-index work for a later pass). Mentions
// link optimistically to /handle without checking the account exists; a
// stale mention just 404s, which is an acceptable gap for this iteration.
const TOKEN_PATTERN = /([#@][a-zA-Z0-9_]{1,30})/g;

export function linkifyPostBody(body: string): ReactNode[] {
  const parts = body.split(TOKEN_PATTERN);

  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      const handle = part.slice(1).toLowerCase();
      return (
        <Link
          key={index}
          href={`/${handle}`}
          style={{ color: "var(--accent-navy)", fontWeight: 600 }}
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith("#")) {
      return (
        <span key={index} style={{ color: "var(--accent-green)", fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    return part;
  });
}
