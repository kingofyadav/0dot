# Navigation

Status: Foundational document (Priority 8). Scope: the signed-in-app nav shell (sidebar/bottom-nav/contextual panel) below — this document does not cover the logged-out landing page's own nav, which is `MarketingNav` (`src/components/marketing/MarketingNav.tsx`, `"/"` only, see `COMPONENT_LIBRARY.md`): a much simpler logo + Log in/Create-your-0dot header that intentionally isn't `SiteHeader`, since `SiteHeader` explicitly skips `/`, `/login`, `/signup` (`isChromelessPath`, `route-context.ts`) in favor of each page's own single-purpose chrome.

## Desktop — Live (lg+ breakpoint, 1024px+, per `RESPONSIVE_LAYOUT.md`)

- **Left sidebar (`Sidebar.tsx`):** primary destinations via the shared `NavLinks` component (also see Rule 1 below) — desktop-only, hidden below 1024px via CSS (not conditional rendering, since SSR doesn't know the viewport). The brand/logo row lives in `SiteHeader.tsx`'s desktop top header, not the sidebar itself.
- **Top search (`SearchForm`, in `SiteHeader.tsx`'s `.desktopTopHeaderSearchWrap`):** global search across users/communities/posts/businesses (`/search`), in the persistent header rather than buried in a sidebar item.
- **Right contextual panel (`ContextualRail.tsx`):** a fixed global element for every signed-in visitor (shown on every page with chrome; hidden on chromeless pages). Branches internally on auth state — `AnonymousContextualRail` for logged-out visitors gets a sign-in prompt plus non-personalized suggestions rather than nothing.

## Mobile — Live (base breakpoint, <1024px)

- **Bottom navigation (`MobileBottomNav.tsx`):** Home, Search, a center create action, Notifications, Profile — 4 destinations plus the center create slot, within the "4–5 max" target. Returns `null` for a visitor with no claimed profile (same posture as `ContextualRail`) rather than rendering a half-working bar. The hamburger dropdown (`MobileNavMenu.tsx`, via `NavLinks`) is the sibling rendering of the same destination list for anything not in the condensed bottom-nav set (e.g. Explore).
- **Global search:** the bottom nav's own Search tab (`/search`), not a separate top-of-screen affordance.
- **Floating create button:** implemented docked into the bottom-nav bar's center slot (`.bottomNavCreate`) rather than floating over content — deep-links to `/feed#compose-box`, which focuses itself on arrival. Compose itself is still only inline on `/feed` (see `ComposeBox.tsx`) — this button gets you there, it doesn't open compose from an arbitrary page.
- **Swipe gestures:** still not built anywhere. The rule below still applies whenever this is picked up — only for an obvious, reversible action (e.g. swipe-to-dismiss a notification), never for anything destructive, consistent with `UX_GUIDELINES.md` #9.

## Current Implementation Notes (worth keeping as-is)

- **`proxy.ts`'s `x-pathname` header injection** is the mechanism that lets Server Components (like `SiteHeader`) know the current route for active-state/context-aware rendering (e.g. the "Join for free" CTA only appearing on profile pages). Client-side active-link highlighting in the sidebar/bottom-nav uses `isPathActive` (`NavLinks.tsx`, consumed via `usePathname()`) instead — a separate, client-side mechanism, not a second consumer of the `x-pathname` header.
- **Reserved-username checking doubles as route-type detection** (`validateUsernameFormat(firstSegment) === null` distinguishes "this is a profile page" from "this is a static route").

## Rules

1. **Primary destinations are identical in concept across desktop and mobile** (`UX_GUIDELINES.md` #7) — the sidebar and bottom-nav are two renderings of the same destination list, defined once, not maintained as two separate hardcoded lists.
2. **No destination appears in nav before its page exists.** Don't add a "Communities" nav entry ahead of Phase 3 shipping, even as a disabled/"coming soon" placeholder — dead nav entries erode trust in the nav itself.
3. **The header's tricolor gradient underline (`.siteHeader::after`) is a persistent brand element** — any sidebar/bottom-nav addition should feel like it belongs to the same visual system (see `DESIGN_SYSTEM.md`), not a bolted-on different component library.
