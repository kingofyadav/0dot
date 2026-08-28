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

// The landing page ("/"), /login and /signup each render their own
// self-contained hero/auth card with no site chrome at all — matching the
// classic split-layout marketing pattern (logo/pitch beside a login form,
// no header, no nav). /forgot-password, /reset-password, /verify/sent, and
// /claim-username already use the same chromeless .authWrap/.authCard CSS
// (globals.css) but were missing from this set (live-site QA pass,
// 2026-08-25) — they rendered with the full SiteHeader/Sidebar shell wrapped
// around a card visually designed to stand alone, which looked broken.
const CHROMELESS_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify/sent",
  "/claim-username",
  // Public app-download landing page (src/app/download/page.tsx) — the
  // link shared from app-store listings, QR codes, and social bios, so it
  // needs to stand on its own with MarketingNav like "/", not the logged-in
  // SiteHeader/Sidebar shell wrapped around a page anonymous visitors land
  // on directly.
  "/download",
  // Marketing pages (redesign Phase 3) — MarketingNav + MarketingFooter,
  // same posture as /download.
  "/about",
]);

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
