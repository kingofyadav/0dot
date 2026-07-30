import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { Sidebar } from "./Sidebar";
import { MobileNavMenu } from "./MobileNavMenu";
import { NavLinks } from "./NavLinks";
import { NavAction } from "./NavAction";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const greeting = user?.profile ? user.profile.displayName : "Welcome";

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
      {/* Desktop (>=1024px) and mobile render simultaneously — CSS decides
          which is visible, since SSR has no viewport to branch on. See
          .desktopSidebar / .mobileHeader in globals.css. */}
      <Sidebar greeting={greeting} hasProfile={hasProfile} showJoinCta={showJoinCta} />

      <header className="mobileHeader">
        <div className="siteHeaderBrand">
          <ThemeToggleLogo />
          <span style={{ fontWeight: 600 }}>{greeting}</span>
        </div>
        <MobileNavMenu>
          <NavLinks showBookmarks={hasProfile} />
          <NavAction hasProfile={hasProfile} showJoinCta={showJoinCta} />
        </MobileNavMenu>
      </header>
    </>
  );
}
