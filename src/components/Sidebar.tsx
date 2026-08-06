import { NavLinks } from "./NavLinks";

// Desktop-only (>=1024px, --bp-lg per RESPONSIVE_LAYOUT.md) left nav — hidden
// below that via CSS in globals.css, not conditional rendering, since SSR
// doesn't know the viewport. The mobile hamburger dropdown is the sibling
// rendering of the same destinations, see SiteHeader.tsx. The brand
// (logo+greeting) row lives in the desktop top header now, not here — see
// SiteHeader.tsx's .desktopTopHeader, which sits directly above this sidebar
// in the grid, so duplicating the logo here would be redundant.
//
// No bottom NavAction here (deliberately removed) — Log out is reachable via
// AccountMenu's avatar dropdown in the desktop header, and the "Join for
// free" CTA doesn't apply to the sidebar (it only shows on a visited
// profile page, not globally).
export function Sidebar({
  profileHandle,
}: {
  profileHandle: string | null;
}) {
  return (
    <aside className="desktopSidebar">
      <nav className="sidebarNav">
        <NavLinks profileHandle={profileHandle} />
      </nav>
    </aside>
  );
}
