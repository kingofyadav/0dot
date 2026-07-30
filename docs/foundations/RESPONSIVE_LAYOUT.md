# Responsive Layout

Status: Foundational document (Priority 6). **Current state: not implemented.** Every page today (`authWrap`/`authCard` max-width 380px, `profileCard` max-width 560px) is a single centered column with no tested behavior at other viewports, and no breakpoints exist anywhere in `globals.css`. This document defines the target scale so the next round of UI work builds it in rather than retrofitting later. Design mobile-first, per the product brief — never desktop-first.

## Breakpoint Scale

| Token | Min-width | Target devices |
|---|---|---|
| (base) | 0 | Mobile portrait — the default, unqualified CSS |
| `--bp-sm` | 480px | Mobile landscape / large phones |
| `--bp-md` | 768px | Tablet portrait |
| `--bp-lg` | 1024px | Tablet landscape / small laptop |
| `--bp-xl` | 1280px | Laptop / desktop |
| `--bp-2xl` | 1536px | Ultra-wide / large desktop |

CSS custom properties can't be used inside `@media` queries directly, so these are documented values to use literally in media queries (`@media (min-width: 768px)`), not actual `var()` tokens — keep this list as the single source of truth for which literal pixel values are "official" breakpoints so they don't drift per-component.

## Layout Strategy Per Breakpoint

- **Base (mobile, <480px):** single column, full-width content with side padding (already the case for `.authCard`/`.profileCard` content, minus the fixed max-width — that part needs to become fluid: `width: 100%` with the current `max-width` values kept as a ceiling, not a fixed width). Bottom navigation (once built, see `NAVIGATION.md`) reserves bottom safe-area space.
- **sm–md (480–1024px):** still effectively single-column for content-focused pages (feed, profile) — the content max-width values already chosen (380px auth, 560px profile/feed) remain correct ceilings here, just now actually fluid below that width instead of clipping/overflowing.
- **lg+ (1024px+):** this is where the desktop navigation shell (left sidebar + top search + right contextual panel, per `NAVIGATION.md`) turns on. Below `--bp-lg`, that shell collapses to the mobile bottom-nav pattern instead.
- **xl–2xl (1280px+):** content column stays capped at its current max-width (do not let post/profile text lines stretch edge-to-edge on large monitors — readability, not screen-filling, is the goal); extra width goes to the sidebar/contextual-panel chrome, not to widening the content column itself.

## Rules

1. **No fixed pixel widths on content containers without a breakpoint-aware fallback below them.** `max-width` + fluid `width: 100%` + side padding is the pattern; a bare `width: 380px` is not.
2. **Test every new page at 375px, 768px, and 1440px minimum** before calling it done — these three roughly stand in for the base/tablet/desktop tiers above.
3. **Never hide primary content on small screens to make room for chrome.** If mobile and desktop can't both show something, mobile wins the content and desktop chrome (sidebars, contextual panels) is what becomes conditional — not the reverse.
4. **Touch-vs-pointer, not just viewport width, matters.** A touch-capable laptop with a wide viewport still needs 44px touch targets (per `UX_GUIDELINES.md` #4); don't assume "wide viewport = mouse" when sizing interactive elements.

## Immediate Next Step (not yet done)

Before any new page is built, retrofit `.authCard` and `.profileCard` in `globals.css` from fixed `max-width` single-column boxes to properly fluid containers using the scale above, and manually verify in Chrome at the three reference widths in Rule 2. This is flagged as the concrete first task for whenever responsive work is picked up — not performed as part of writing this document, since it's implementation, not planning.
