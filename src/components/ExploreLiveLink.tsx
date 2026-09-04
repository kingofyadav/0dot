import { ArrowUpRight } from "lucide-react";
import { TrackedLink } from "@/components/marketing/TrackedLink";

// Was duplicated inline across page.tsx, login/page.tsx and signup/page.tsx
// (identical JSX in all three) — consolidated here per COMPONENT_LIBRARY.md's
// "avoid page-specific components whenever a pattern repeats" rule, and
// gives the hero's one explicit CTA link a single place to fire
// hero_cta_click (spec §53) rather than three copies to keep in sync.
//
// Server component: the only interactive bit is the analytics ping, which
// lives in TrackedLink (the sole hydrated node here) so this can render on
// the statically-prerendered marketing/login/signup pages without dragging
// them client-side.
export function ExploreLiveLink() {
  return (
    <TrackedLink
      href="/explore"
      // Same DB-connection-burst-503 fix as DigitalHomeVisual's nodes —
      // this renders alongside them on the same pages, one more concurrent
      // prefetch in the same burst.
      prefetch={false}
      className="exploreLiveButton"
      event="hero_cta_click"
      eventData={{ cta: "explore" }}
    >
      <span className="exploreLiveDot" aria-hidden="true" />
      Explore live
      <ArrowUpRight size={16} aria-hidden="true" />
    </TrackedLink>
  );
}
