"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Home, Plus, Search, User, type LucideIcon } from "lucide-react";
import { isPathActive } from "./NavLinks";

// Mobile-only (<1024px, see .mobileBottomNav in globals.css) tab bar — the
// same "primary destinations, condensed to icons (4-5 max)" target described
// in docs/foundations/NAVIGATION.md, with the create action taking the
// center slot instead of a separate floating button (NAVIGATION.md's FAB,
// just docked into the bar rather than floating over content). Everything
// here needs a claimed profile to mean anything (own profile link,
// notifications, posting) — same "hidden for a visitor with no profile"
// posture as ContextualRail, so this returns null rather than rendering a
// half-working bar. RootLayout mirrors this exact condition via
// body.hasBottomNav to reserve scroll space, see layout.tsx.
export function MobileBottomNav({ profileHandle }: { profileHandle: string | null }) {
  const pathname = usePathname();
  if (!profileHandle) return null;

  const leading: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/feed", label: "Home", icon: Home },
    // Global /search (users/posts/communities/.../marketplace tabs), not
    // /explore — a magnifying-glass icon that lands on a plain chronological
    // feed with no search box reads as "does nothing" (Explore is still
    // reachable from the hamburger menu's NavLinks).
    { href: "/search", label: "Search", icon: Search },
  ];
  const trailing: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: `/${profileHandle}`, label: "Profile", icon: User },
  ];

  return (
    <nav className="mobileBottomNav" aria-label="Primary">
      {leading.map(({ href, label, icon: Icon }) => {
        const isActive = isPathActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`bottomNavLink${isActive ? " bottomNavLinkActive" : ""}`}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={22} />
          </Link>
        );
      })}

      {/* Deep-links to the compose box on /feed (id="compose-box" in
          ComposeBox.tsx), which focuses itself on arrival — see the
          hashchange handling there. Not a separate "new post" route: the
          compose UI only exists inline on /feed today (NAVIGATION.md). */}
      <Link href="/feed#compose-box" className="bottomNavCreate" aria-label="New post">
        <Plus aria-hidden="true" size={24} />
      </Link>

      {trailing.map(({ href, label, icon: Icon }) => {
        const isActive = isPathActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`bottomNavLink${isActive ? " bottomNavLinkActive" : ""}`}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={22} />
          </Link>
        );
      })}
    </nav>
  );
}
