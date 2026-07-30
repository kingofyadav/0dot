# Navigation

Status: Foundational document (Priority 8). **Current state: minimal.** Today's nav is a single sticky header (`SiteHeader.tsx`) with logo+greeting on the left and a "Feed" link — no sidebar, no search, no bottom nav, no contextual panel. This document defines the target structure; none of it is implemented yet.

## Desktop (target — lg+ breakpoint, 1024px+, per `RESPONSIVE_LAYOUT.md`)

- **Left sidebar:** primary destinations (Feed/Home, Explore, Notifications, Messages, Communities, Profile) as the app grows past what a single header row can hold. Today's single "Feed" link is the seed of this — it moves into the sidebar wholesale once a second nav destination exists, rather than the header row growing indefinitely wide.
- **Top search:** global search (Phase 1 named search as a launch feature — users/communities/posts/businesses — not built yet). Belongs in the persistent header, not buried in a sidebar item, since search is a cross-cutting action from anywhere.
- **Right contextual panel:** page-dependent auxiliary content (suggested users, trending topics, community info) — optional per page, not a fixed global element. Do not build this before there's real content to put in it; an empty contextual panel is worse than no panel.

## Mobile (target — base breakpoint, <1024px)

- **Bottom navigation:** the same primary destinations as the desktop sidebar, condensed to icons (4–5 max, per standard mobile nav constraints — more than that needs an overflow/"More" tab rather than cramming).
- **Global search:** accessible from the top of the screen or a dedicated bottom-nav slot — decide based on how central search turns out to be once Phase 1 search ships; don't reserve a whole bottom-nav slot for it preemptively if it turns out to be a secondary action.
- **Floating create button (FAB):** primary compose action (new post today; eventually also "new link", context-dependent). Today's compose box is inline at the top of `/feed` — that stays for the feed page itself, but a FAB becomes relevant once compose needs to be reachable from pages that aren't the feed.
- **Swipe gestures:** only where they map to an obvious, reversible action (e.g. swipe-to-dismiss a notification) — never for anything destructive or hard to discover, consistent with `UX_GUIDELINES.md` #9's confirmation requirement.

## Current Implementation Notes (worth keeping as-is)

- **`proxy.ts`'s `x-pathname` header injection** is the mechanism that lets Server Components (like `SiteHeader`) know the current route for active-state/context-aware rendering (e.g. the "Join for free" CTA only appearing on profile pages). This pattern extends naturally to active-link highlighting in the future sidebar/bottom-nav — no new mechanism needed, just more consumers of the existing header.
- **Reserved-username checking doubles as route-type detection** (`validateUsernameFormat(firstSegment) === null` distinguishes "this is a profile page" from "this is a static route") — this same check is what a future sidebar needs to decide whether to show profile-specific nav context vs. generic nav.

## Rules

1. **Primary destinations are identical in concept across desktop and mobile** (`UX_GUIDELINES.md` #7) — the sidebar and bottom-nav are two renderings of the same destination list, defined once, not maintained as two separate hardcoded lists.
2. **No destination appears in nav before its page exists.** Don't add a "Communities" nav entry ahead of Phase 3 shipping, even as a disabled/"coming soon" placeholder — dead nav entries erode trust in the nav itself.
3. **The header's tricolor gradient underline (`.siteHeader::after`) is a persistent brand element** — any sidebar/bottom-nav addition should feel like it belongs to the same visual system (see `DESIGN_SYSTEM.md`), not a bolted-on different component library.
