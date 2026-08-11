"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { track } from "@vercel/analytics";

// Was duplicated inline across page.tsx, login/page.tsx and signup/page.tsx
// (identical JSX in all three) — consolidated here per COMPONENT_LIBRARY.md's
// "avoid page-specific components whenever a pattern repeats" rule, and
// gives the hero's one explicit CTA link a single place to fire
// hero_cta_click (spec §53) rather than three copies to keep in sync.
export function ExploreLiveLink() {
  return (
    <Link
      href="/explore"
      className="exploreLiveButton"
      onClick={() => track("hero_cta_click", { cta: "explore" })}
    >
      <span className="exploreLiveDot" aria-hidden="true" />
      Explore live
      <ArrowUpRight size={16} aria-hidden="true" />
    </Link>
  );
}
