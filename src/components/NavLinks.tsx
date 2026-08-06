"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  Code2,
  FileText,
  Flame,
  Home,
  MessageCircle,
  Search,
  Settings as SettingsIcon,
  Shield,
  User,
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
  Content: FileText,
  Tools: Wrench,
  Developer: Code2,
  Notifications: Bell,
};

// The one master nav's settings entry — a Reddit-style accordion instead of
// a flat link, so every settings destination (previously a separate
// SettingsSidebar column competing with page content) lives in this single
// left nav instead. Expand state defaults to whether the visitor is
// currently under /s/{handle}, then persists across client-side navigation
// since this component doesn't remount between pages.
function SettingsNav({ pathname, profileHandle }: { pathname: string; profileHandle: string }) {
  const indexHref = `/s/${profileHandle}`;
  const isActive = isPathActive(pathname, indexHref);
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div className="navSettingsBlock">
      <div className={`navLink navSettingsRow${isActive ? " navLinkActive" : ""}`}>
        <Link href={indexHref} className="navSettingsLink" aria-current={isActive ? "page" : undefined}>
          <span className="navLinkIcon" aria-hidden="true">
            <SettingsIcon size={20} />
          </span>
          Settings
        </Link>
        <button
          type="button"
          className="navSettingsExpand"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse settings sections" : "Expand settings sections"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
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

  const items: { href: string; label: string; icon: LucideIcon }[] = [
    ...(profileHandle ? [{ href: `/${profileHandle}`, label: "Profile", icon: User }] : []),
    { href: "/feed", label: "Feed", icon: Home },
    { href: "/explore", label: "Explore", icon: Search },
    { href: "/trending", label: "Trending", icon: Flame },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    { href: "/b", label: "Businesses", icon: Briefcase },
    { href: "/c", label: "Communities", icon: Users },
    { href: "/org", label: "Organizations", icon: Building2 },
    // Desktop reaches this via SiteHeader's icon cluster (NotificationBell),
    // which is deliberately hidden on mobile — but that left mobile with no
    // path to /notifications at all (the comment in SiteHeader.tsx claims
    // "still reachable via NavLinks", which wasn't actually true until this
    // entry existed).
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  ];

  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = isPathActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`navLink${isActive ? " navLinkActive" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="navLinkIcon" aria-hidden="true">
              <Icon size={20} />
            </span>
            {label}
          </Link>
        );
      })}
      {profileHandle && <SettingsNav pathname={pathname} profileHandle={profileHandle} />}
      <SearchForm />
    </>
  );
}
