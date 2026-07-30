import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { NavLinks } from "./NavLinks";
import { NavAction } from "./NavAction";

// Desktop-only (>=1024px, --bp-lg per RESPONSIVE_LAYOUT.md) left nav — hidden
// below that via CSS in globals.css, not conditional rendering, since SSR
// doesn't know the viewport. The mobile hamburger dropdown is the sibling
// rendering of the same destinations, see SiteHeader.tsx.
export function Sidebar({
  greeting,
  hasProfile,
  showJoinCta,
}: {
  greeting: string;
  hasProfile: boolean;
  showJoinCta: boolean;
}) {
  return (
    <aside className="desktopSidebar">
      <div className="siteHeaderBrand">
        <ThemeToggleLogo />
        <span style={{ fontWeight: 600 }}>{greeting}</span>
      </div>

      <nav className="sidebarNav">
        <NavLinks showBookmarks={hasProfile} />
      </nav>

      <div className="sidebarSpacer" />

      <NavAction hasProfile={hasProfile} showJoinCta={showJoinCta} />
    </aside>
  );
}
