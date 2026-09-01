import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";
import { TrackedLink } from "@/components/marketing/TrackedLink";

// Landing-page-only nav (spec §8) — deliberately not SiteHeader.tsx, whose
// own comment explains why it skips "/", "/login", "/signup": those pages
// already have their own sign-up form front and center. This nav sits above
// that hero/form, not instead of it.
//
// Server component: the mobile menu is a native <details>/<summary> (no
// state), ThemeToggleLogo is already its own client island, and the one
// analytics ping is in TrackedLink — so nothing here forces the marketing
// page client-side.

export function MarketingNav() {
  return (
    <header className="marketingNav">
      <div className="marketingNavInner">
        <Link href="/" className="marketingNavBrand" aria-label="0dot home">
          <ThemeToggleLogo size={32} interactive={false} />
        </Link>

        <div className="marketingNavActions">
          <Link href="/login" className="button buttonSecondary buttonSmall">
            Log in
          </Link>
          <TrackedLink
            href="/signup"
            className="button buttonSmall"
            event="nav_cta_click"
          >
            Create your 0dot
          </TrackedLink>
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
            <TrackedLink href="/signup" className="button" event="nav_cta_click">
              Create your 0dot
            </TrackedLink>
          </div>
        </details>
      </div>
    </header>
  );
}
