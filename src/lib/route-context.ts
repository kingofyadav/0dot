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

// The right-side contextual rail is opt-in per route, not a fixed global
// element (docs/foundations/NAVIGATION.md) — only shown where there's real
// content for it (notifications preview, suggested users).
const RAIL_ROUTES = new Set(["/feed", "/explore", "/notifications"]);

export function showsContextualRail(pathname: string): boolean {
  return RAIL_ROUTES.has(pathname);
}

// The landing page ("/") and the standalone /login and /signup pages each
// render their own self-contained hero/auth card with no site chrome at
// all — matching the classic split-layout marketing pattern (logo/pitch
// beside a login form, no header, no nav).
const CHROMELESS_PATHS = new Set(["/", "/login", "/signup"]);

export function isChromelessPath(pathname: string): boolean {
  return CHROMELESS_PATHS.has(pathname);
}
