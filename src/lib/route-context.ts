import "server-only";
import { validateUsernameFormat } from "@/lib/reserved-usernames";

// A path's first segment is a profile page iff it passes username format
// validation and isn't reserved — the same check the router itself uses to
// resolve /{username}, so this can never drift from what's actually a
// profile route. Originally inline in SiteHeader.tsx; extracted once a
// second consumer (RootLayout, for the contextual rail) needed it too.
export function isProfilePagePath(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? "";
  return firstSegment.length > 0 && validateUsernameFormat(firstSegment) === null;
}

// The landing page ("/") and the standalone /login and /signup pages each
// render their own self-contained hero/auth card with no site chrome at
// all — matching the classic split-layout marketing pattern (logo/pitch
// beside a login form, no header, no nav). All three opt out of the
// SiteHeader/Sidebar/rail grid shell (see body.noChrome in globals.css).
const CHROMELESS_PATHS = new Set(["/", "/login", "/signup"]);

export function isChromelessPath(pathname: string): boolean {
  return CHROMELESS_PATHS.has(pathname);
}

// Narrower than CHROMELESS_PATHS: only /login and /signup pin to exactly
// one viewport (body.fixedViewport in globals.css — fixed 100dvh, no page
// scroll, single-purpose task pages per spec §15). "/" was the same until
// the marketing-page redesign added nav/product-story/features/footer below
// the hero — that content needs the page to actually scroll, so "/" keeps
// isChromelessPath's true (no SiteHeader/Sidebar) but drops out of this
// narrower set.
const FIXED_VIEWPORT_PATHS = new Set(["/login", "/signup"]);

export function isFixedViewportPath(pathname: string): boolean {
  return FIXED_VIEWPORT_PATHS.has(pathname);
}
