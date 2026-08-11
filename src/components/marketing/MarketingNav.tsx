"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { track } from "@vercel/analytics";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";

// Landing-page-only nav (spec §8) — deliberately not SiteHeader.tsx, whose
// own comment explains why it skips "/", "/login", "/signup": those pages
// already have their own sign-up form front and center. This nav sits above
// that hero/form, not instead of it.

function trackCta() {
  track("nav_cta_click");
}

export function MarketingNav() {
  return (
    <header className="marketingNav">
      <div className="marketingNavInner">
        <Link href="/" className="marketingNavBrand" aria-label="0dot home">
          <ThemeToggleLogo size={32} />
        </Link>

        <div className="marketingNavActions">
          <Link href="/login" className="button buttonSecondary buttonSmall">
            Log in
          </Link>
          <Link href="/signup" className="button buttonSmall" onClick={trackCta}>
            Create your 0dot
          </Link>
        </div>

        {/* Mobile compact menu — <details>/<summary>, the same disclosure
            primitive .profileEditToggle already uses elsewhere in the app,
            rather than introducing a new dropdown component
            (COMPONENT_LIBRARY.md flags a generic Dropdown as not yet
            needed). Native, so it's keyboard/AT-operable for free. */}
        <details className="marketingNavMobileMenu">
          <summary aria-label="Menu">
            <Menu size={20} aria-hidden="true" />
          </summary>
          <div className="marketingNavMobilePanel">
            <Link href="/login" className="button buttonSecondary">
              Log in
            </Link>
            <Link href="/signup" className="button" onClick={trackCta}>
              Create your 0dot
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
