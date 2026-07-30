import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { Sidebar } from "./Sidebar";
import { MobileNavMenu } from "./MobileNavMenu";
import { NavLinks } from "./NavLinks";
import { NavAction } from "./NavAction";
import { SearchForm } from "./SearchForm";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const greeting = user?.profile ? user.profile.displayName : "Welcome";
  const profileHandle = user?.username?.handle ?? null;

  // An anonymous visitor landing on someone's public profile (a common
  // discovery entry point, e.g. via a shared link) is a good moment for a
  // join CTA — same pattern products like Linktree use. Everywhere else
  // when logged out (the landing page itself, /login, /signup) already
  // has its own sign-up form front and center, so no extra CTA is added there.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const firstSegment = pathname.split("/")[1] ?? "";
  const isProfilePage =
    firstSegment.length > 0 && validateUsernameFormat(firstSegment) === null;

  const hasProfile = Boolean(user?.profile);
  const showJoinCta = !hasProfile && isProfilePage;

  return (
    <>
      {/* Desktop (>=1024px), and mobile render simultaneously — CSS decides
          which is visible, since SSR has no viewport to branch on. See
          .desktopTopHeader / .desktopSidebar / .mobileHeader in globals.css. */}
      <header className="desktopTopHeader">
        <div className="siteHeaderBrand">
          <ThemeToggleLogo />
          <span style={{ fontWeight: 600 }}>{greeting}</span>
        </div>
        <div className="desktopTopHeaderSearchWrap">
          <SearchForm />
        </div>
      </header>

      <Sidebar hasProfile={hasProfile} showJoinCta={showJoinCta} profileHandle={profileHandle} />

      <header className="mobileHeader">
        <div className="siteHeaderBrand">
          <ThemeToggleLogo />
          <span style={{ fontWeight: 600 }}>{greeting}</span>
        </div>
        <MobileNavMenu>
          <NavLinks showBookmarks={hasProfile} profileHandle={profileHandle} />
          <NavAction hasProfile={hasProfile} showJoinCta={showJoinCta} />
        </MobileNavMenu>
      </header>
    </>
  );
}
