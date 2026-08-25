import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { isProfilePagePath } from "@/lib/route-context";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { Sidebar } from "./Sidebar";
import { MobileNavMenu } from "./MobileNavMenu";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavLinks } from "./NavLinks";
import { NavAction } from "./NavAction";
import { NotificationBell } from "./NotificationBell";
import { MessagesBadge } from "./MessagesBadge";
import { AccountMenu } from "./AccountMenu";
import { SearchForm } from "./SearchForm";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const profileHandle = user?.username?.handle ?? null;
  // NotificationBell (desktop) already fetches/renders this count itself;
  // MobileBottomNav's Bell icon has no server-fetching path of its own
  // (it's "use client", rendered here so it can be handed this as a prop).
  const unreadNotificationCount = user ? await getUnreadNotificationCount(user.id) : 0;

  // An anonymous visitor landing on someone's public profile (a common
  // discovery entry point, e.g. via a shared link) is a good moment for a
  // join CTA — same pattern products like Linktree use. Everywhere else
  // when logged out (the landing page itself, /login, /signup) already
  // has its own sign-up form front and center, so no extra CTA is added there.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isProfilePage = isProfilePagePath(pathname);
  // /search already has its own in-page search box (autofocused, with
  // live/debounced results) — the header's box right above it did exactly
  // the same GET-to-/search thing, just as a second, unexplained input.
  const onSearchPage = pathname === "/search";

  const hasProfile = Boolean(user?.profile);
  const showJoinCta = !hasProfile && isProfilePage;

  // AccountMenu is an avatar-only trigger, no name — grouped with
  // messages/notifications in one icon cluster that sits at the far right
  // of the header (per explicit direction). The user's real display name
  // still shows next to the brand logo on the left (the original greeting),
  // independently of AccountMenu.
  const accountMenu =
    user?.profile && profileHandle ? (
      <AccountMenu displayName={user.profile.displayName} avatarUrl={user.profile.avatarUrl} profileHandle={profileHandle} />
    ) : null;
  const greeting = <span style={{ fontWeight: 600 }}>{user?.profile?.displayName ?? "Welcome"}</span>;
  const iconCluster = (
    <>
      <MessagesBadge />
      <NotificationBell />
      {accountMenu}
    </>
  );

  return (
    <>
      {/* Desktop (>=1024px), and mobile render simultaneously — CSS decides
          which is visible, since SSR has no viewport to branch on. See
          .desktopTopHeader / .desktopSidebar / .mobileHeader in globals.css. */}
      <header className="desktopTopHeader">
        <div className="siteHeaderBrand">
          <ThemeToggleLogo />
          {greeting}
        </div>
        <div className="desktopTopHeaderSearchWrap">
          <div className="desktopTopHeaderSearchCenter">
            {!onSearchPage && <SearchForm />}
          </div>
          <div className="siteHeaderActions">{iconCluster}</div>
        </div>
      </header>

      <Sidebar profileHandle={profileHandle} />

      <header className="mobileHeader">
        <div className="siteHeaderBrand">
          {/* Desktop and mobile headers both render unconditionally (CSS
              picks which is visible, see the comment above) — this logo is
              the one actually painted on mobile viewports, so it needs
              priority too, or the browser's real (viewport-scoped) LCP
              detector flags it as an eagerly-needed image that loaded lazy
              (the desktop copy is priority but never painted there, so
              skipping this one bought nothing). */}
          <ThemeToggleLogo />
          {greeting}
        </div>
        {/* Messages/notifications/account avatar are desktop-only (per
            explicit direction) — mobile keeps just the nav toggle; Messages
            and Settings are still reachable via NavLinks inside it, and
            NavAction still has Log out. */}
        <MobileNavMenu>
          <NavLinks profileHandle={profileHandle} />
          <NavAction hasProfile={hasProfile} showJoinCta={showJoinCta} />
        </MobileNavMenu>
      </header>

      <MobileBottomNav profileHandle={profileHandle} unreadNotificationCount={unreadNotificationCount} />
    </>
  );
}
