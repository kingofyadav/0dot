"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  ChevronDown,
  Code2,
  CreditCard,
  FileText,
  Flame,
  Home,
  Lock,
  MessageCircle,
  Search,
  Settings as SettingsIcon,
  Shield,
  User,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { SearchForm } from "./SearchForm";
import { settingsNavGroups } from "@/lib/settings-nav";

// Exported for MobileBottomNav.tsx — same active-link rule, one definition.
export function isPathActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

// One icon per settingsNavGroups() label — purely a display concern (the
// nav accordion), so it lives here rather than teaching settings-nav.ts's
// shared data shape about lucide-react.
const SETTINGS_GROUP_ICONS: Record<string, LucideIcon> = {
  Profile: User,
  Security: Shield,
  Portfolio: Briefcase,
  Monetization: Wallet,
  Billing: CreditCard,
  Content: FileText,
  Tools: Wrench,
  Developer: Code2,
  Notifications: Bell,
  Privacy: Lock,
  Account: UserCog,
};

type NavItem = { href: string; label: string; icon: LucideIcon };

// One nav destination row — shared by the flat top tier and every
// NavSection below it, so the icon/label/active-state markup is written
// once instead of once per tier.
//
// prefetch={false}: this row is part of the persistent chrome, mounted and
// viewport-visible on every single authenticated page — Next.js's default
// prefetch behavior would otherwise eagerly fetch every one of these ~10
// destinations' full dynamic RSC payload (each running its own page's
// getCurrentUser()/DB queries) on every page load, all at once. Confirmed
// live (2026-08-25) as the cause of intermittent 503s on exactly this set
// of routes (/trending, /messages, /notifications, /bookmarks, /wallet,
// own profile) — a burst of ~10 concurrent data-fetching requests per page
// view was overrunning the DB connection/concurrency budget. Turbo Link
// still navigates instantly on click either way; this only removes the
// speculative background fetch nothing was waiting on.
function NavItemLink({ href, label, icon: Icon, pathname }: NavItem & { pathname: string }) {
  const isActive = isPathActive(pathname, href);
  return (
    <Link
      href={href}
      prefetch={false}
      className={`navLink${isActive ? " navLinkActive" : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="navLinkIcon" aria-hidden="true">
        <Icon size={20} />
      </span>
      {label}
    </Link>
  );
}

// A labeled, collapsible group of destinations — Reddit's "COMMUNITIES"-style
// section header. Plain <details>/<summary> (no React state) since, unlike
// SettingsNav below, the label itself is never a navigation target — only
// the toggle behavior matters here.
function NavSection({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <details className="navSectionDetails" open>
      <summary className="navSectionSummary">
        <ChevronDown size={14} className="navSectionChevron" aria-hidden="true" />
        {label}
      </summary>
      <div className="navSectionItems">
        {items.map((item) => (
          <NavItemLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
    </details>
  );
}

// The master nav's settings entry — a Reddit-style accordion instead of a
// flat link, so every settings destination (previously a separate
// SettingsSidebar column competing with page content) lives in this single
// left nav instead. Styled as the third main-nav section (alongside "You"
// and "Spaces" above), just with a real link in its header in addition to
// the expand toggle, since "Settings" itself is a destination and not just
// a group label. Expand state defaults to whether the visitor is currently
// under /s/{handle}, then persists across client-side navigation since this
// component doesn't remount between pages.
function SettingsNav({ pathname, profileHandle }: { pathname: string; profileHandle: string }) {
  const indexHref = `/s/${profileHandle}`;
  const isActive = isPathActive(pathname, indexHref);
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div className="navSettingsBlock">
      <div className={`navSectionSummary navSettingsRow${isActive ? " navLinkActive" : ""}`}>
        <Link href={indexHref} prefetch={false} className="navSettingsLink" aria-current={isActive ? "page" : undefined}>
          <SettingsIcon size={14} aria-hidden="true" />
          Settings
        </Link>
        <button
          type="button"
          className="navSettingsExpand"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse settings sections" : "Expand settings sections"}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            size={14}
            className={`navSectionChevron${expanded ? "" : " navSectionChevronClosed"}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {expanded && (
        <div className="navSubGroups">
          {settingsNavGroups(profileHandle).map((group) => {
            const groupHasActive = group.items.some((item) => isPathActive(pathname, item.href));
            const GroupIcon = SETTINGS_GROUP_ICONS[group.label];
            return (
              <details key={group.label} className="navSubGroupDetails" open={groupHasActive}>
                <summary className="navSubGroupSummary">
                  {GroupIcon && <GroupIcon size={13} aria-hidden="true" />}
                  {group.label}
                </summary>
                <div className="navSubGroupItems">
                  {group.items.map((item) => {
                    const itemActive = isPathActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`navSubLink${itemActive ? " navSubLinkActive" : ""}`}
                        aria-current={itemActive ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Shared between Sidebar (desktop) and the mobile hamburger dropdown — same
// destinations, same markup, just rendered inside a different container.
// Client Component (usePathname) so the active destination can be
// highlighted — SiteHeader's server-side x-pathname header tells the page
// shell whether a route is a profile page, but per-link active-state needs
// the exact current path, which only the client router knows on navigation.
//
// Every destination is listed regardless of auth state (an anonymous
// visitor should be able to see the full nav, same as a logged-in one) —
// the account-only destinations (Messages/Organizations/Notifications/
// Bookmarks) already redirect an anonymous visitor to /login server-side
// (see each page.tsx's own getCurrentUser()/requireVerifiedUser() guard),
// so there's nothing extra to gate here.
export function NavLinks({
  profileHandle,
}: {
  profileHandle: string | null;
}) {
  const pathname = usePathname();

  // Top tier: identity + core-content loop, always visible — the highest-
  // frequency destinations, mirroring Reddit's terse Home/Popular top list.
  const topItems: NavItem[] = [
    ...(profileHandle ? [{ href: `/${profileHandle}`, label: "Profile", icon: User }] : []),
    { href: "/feed", label: "Feed", icon: Home },
    { href: "/explore", label: "Explore", icon: Search },
    { href: "/trending", label: "Trending", icon: Flame },
  ];

  // "You": personal/inbox-style destinations.
  const youItems: NavItem[] = [
    { href: "/messages", label: "Messages", icon: MessageCircle },
    // Desktop reaches this via SiteHeader's icon cluster (NotificationBell),
    // which is deliberately hidden on mobile — but that left mobile with no
    // path to /notifications at all (the comment in SiteHeader.tsx claims
    // "still reachable via NavLinks", which wasn't actually true until this
    // entry existed).
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    { href: "/wallet", label: "Wallet", icon: Wallet },
  ];

  // "Spaces": other entities you interact with beyond your own profile.
  const spacesItems: NavItem[] = [
    { href: "/b", label: "Businesses", icon: Briefcase },
    { href: "/c", label: "Communities", icon: Users },
    { href: "/org", label: "Organizations", icon: Building2 },
  ];

  return (
    <>
      {topItems.map((item) => (
        <NavItemLink key={item.href} {...item} pathname={pathname} />
      ))}
      <NavSection label="You" items={youItems} pathname={pathname} />
      <NavSection label="Spaces" items={spacesItems} pathname={pathname} />
      {profileHandle && <SettingsNav pathname={pathname} profileHandle={profileHandle} />}
      <SearchForm />
    </>
  );
}
