"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { track } from "@vercel/analytics";

// The one client leaf the marketing pages need for analytics. The marketing
// components (MarketingNav, MarketingStory, ExploreLiveLink) were each
// `"use client"` in full only so an `onClick` handler could call
// @vercel/analytics' `track()` — which pulled their whole (otherwise static)
// subtree, lucide icons included, into the hydration bundle. Isolating the
// click-to-track into this wrapper lets those components be server components
// again; only the handful of actual links hydrate.
type TrackedLinkProps = ComponentProps<typeof Link> & {
  event: string;
  eventData?: Record<string, string | number | boolean | null>;
};

export function TrackedLink({ event, eventData, onClick, ...linkProps }: TrackedLinkProps) {
  return (
    <Link
      {...linkProps}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        track(event, eventData);
        onClick?.(e);
      }}
    />
  );
}
