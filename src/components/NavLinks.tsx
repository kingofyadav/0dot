"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchForm } from "./SearchForm";

const DESTINATIONS = [
  { href: "/feed", label: "Feed", icon: "🏠" },
  { href: "/explore", label: "Explore", icon: "🔍" },
  { href: "/trending", label: "Trending", icon: "🔥" },
  { href: "/c", label: "Communities", icon: "👥" },
  { href: "/b", label: "Businesses", icon: "💼" },
] as const;

// Shared between Sidebar (desktop) and the mobile hamburger dropdown — same
// destinations, same markup, just rendered inside a different container.
// Client Component (usePathname) so the active destination can be
// highlighted — SiteHeader's server-side x-pathname header tells the page
// shell whether a route is a profile page, but per-link active-state needs
// the exact current path, which only the client router knows on navigation.
export function NavLinks({
  showBookmarks,
  profileHandle,
}: {
  showBookmarks: boolean;
  profileHandle: string | null;
}) {
  const pathname = usePathname();

  const items = [
    ...DESTINATIONS,
    ...(showBookmarks
      ? ([
          { href: "/messages", label: "Messages", icon: "💬" },
          { href: "/bookmarks", label: "Bookmarks", icon: "🔖" },
        ] as const)
      : []),
    ...(profileHandle ? [{ href: `/${profileHandle}`, label: "Profile", icon: "👤" }] : []),
  ];

  return (
    <>
      {items.map(({ href, label, icon }) => {
        const isActive = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`navLink${isActive ? " navLinkActive" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="navLinkIcon" aria-hidden="true">
              {icon}
            </span>
            {label}
          </Link>
        );
      })}
      <SearchForm />
    </>
  );
}
