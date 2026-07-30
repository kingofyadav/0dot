import { NavLinks } from "./NavLinks";
import { NavAction } from "./NavAction";

// Desktop-only (>=1024px, --bp-lg per RESPONSIVE_LAYOUT.md) left nav — hidden
// below that via CSS in globals.css, not conditional rendering, since SSR
// doesn't know the viewport. The mobile hamburger dropdown is the sibling
// rendering of the same destinations, see SiteHeader.tsx. The brand
// (logo+greeting) row lives in the desktop top header now, not here — see
// SiteHeader.tsx's .desktopTopHeader, which sits directly above this sidebar
// in the grid, so duplicating the logo here would be redundant.
export function Sidebar({
  hasProfile,
  showJoinCta,
  profileHandle,
}: {
  hasProfile: boolean;
  showJoinCta: boolean;
  profileHandle: string | null;
}) {
  return (
    <aside className="desktopSidebar">
      <nav className="sidebarNav">
        <NavLinks showBookmarks={hasProfile} profileHandle={profileHandle} />
      </nav>

      <div className="sidebarSpacer" />

      <NavAction hasProfile={hasProfile} showJoinCta={showJoinCta} />
    </aside>
  );
}
