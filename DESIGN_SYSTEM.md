# 0dot.in — Design System

Status: Foundational document. `src/app/globals.css` is the source of truth for tokens already implemented — this document explains, formalizes, and extends it. When they conflict, fix `globals.css` to match this document (or update this document if the CSS was the more deliberate recent decision) rather than leaving them silently inconsistent.

## Color

Indian-tricolor-inspired accent system: saffron primary, India green secondary, navy tertiary — used as a restrained accent system, not a literal flag. Confirmed decision, not open for casual revisiting.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | Page background |
| `--foreground` | `#171717` | `#ededed` | Primary text |
| `--surface` | `#ffffff` | `#131313` | Cards, header, raised elements |
| `--border` | `rgba(23,23,23,.12)` | `rgba(237,237,237,.12)` | Hairlines, card/input borders |
| `--accent` | `#ff9933` | `#ffb35c` | Primary interactive color (buttons, focus rings, links-as-actions) |
| `--accent-strong` | `#e6802b` | `#ff9933` | Hover/active state of `--accent` |
| `--accent-soft` | `rgba(255,153,51,.14)` | `rgba(255,179,92,.18)` | Focus rings, subtle backgrounds |
| `--accent-green` | `#138808` | `#22b014` | Secondary accent — decorative (avatar ring, header bar), hashtag styling |
| `--accent-green-soft` | `rgba(19,136,8,.14)` | `rgba(34,176,20,.18)` | Secondary decorative backgrounds |
| `--accent-navy` | `#0b1f66` | `#6b7fd7` | Tertiary — secondary links (auth footer links, @mentions) |
| `--shadow` | 2-layer soft shadow | deeper/darker equivalent | Card elevation |

**Rule:** never hardcode a hex value in a component. Every color reference goes through a CSS variable. This is already followed everywhere in the current codebase — keep it that way as new components are added.

**Dark mode is not simply inverted.** Dark-mode accent values are individually tuned (lighter/more saturated) for contrast against a near-black surface, not derived mechanically from the light values. Any new token added to the palette needs its own dark-mode value chosen for contrast, not an auto-inverted one.

**Semantic colors not yet defined:** success, warning, danger/destructive (beyond the ad hoc `#dc2626` currently hardcoded in `.errorText`). Needed before Trust & Safety (moderation states), Business Platform (transaction status), and any confirmation/destructive-action UI. Add as `--danger` / `--warning` / `--success` (+ `-soft` variants matching the existing pattern) before those features start, not hardcoded per-component like `.errorText` is today.

## Typography

Currently: `var(--font-geist-sans)` (Geist, via `next/font`), no formal type scale — sizes are set ad hoc per element (`1.4rem` auth heading, `1.6rem` profile name, `1.1rem` section heading, `0.85rem`/`0.9rem` for meta text). This is a gap: formalize before the component library (Priority 7) grows past what a handful of pages can keep consistent by eye.

**Target scale** (to be introduced as CSS variables, e.g. `--text-xs` … `--text-3xl`, next time typography is touched — not a blocking retrofit of every existing rem value today):

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 0.8rem | Meta text, timestamps, labels |
| `--text-sm` | 0.9rem | Body secondary, muted text, form labels |
| `--text-base` | 1rem | Body default |
| `--text-lg` | 1.1rem | Section headings (e.g. "Posts") |
| `--text-xl` | 1.4rem | Card/page headings (e.g. auth heading) |
| `--text-2xl` | 1.6rem | Profile display name |
| `--text-3xl` | 2rem+ | Reserved — not yet used, for future marketing/landing headlines |

Font weight: `400` body, `500` labels, `600` interactive/emphasis (buttons, links-as-actions, meta emphasis), `700` headings. Already followed consistently — formalize as the rule, don't add new weights.

A monospace font is not yet chosen. Needed before Phase 10 (developer platform — API keys, code snippets) and any code-display use case.

## Spacing

No formal scale exists yet — current CSS uses direct rem values (`0.35rem`, `0.5rem`, `0.75rem`, `0.85rem`, `1.1rem`, `1.25rem`, `1.5rem`, `1.75rem`, `2rem`) chosen per-instance. Formalize as an 4px-based scale before the component library expands:

`--space-1: 0.25rem` (4px) · `--space-2: 0.5rem` (8px) · `--space-3: 0.75rem` (12px) · `--space-4: 1rem` (16px) · `--space-5: 1.25rem` (20px) · `--space-6: 1.5rem` (24px) · `--space-8: 2rem` (32px) · `--space-10: 2.5rem` (40px)

## Radius

Currently ad hoc: `8px` (icon buttons), `10px` (buttons, inputs), `12px` (link items), `16px` (cards), `50%` (avatars). Formalize as `--radius-sm: 8px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-full: 9999px`. The existing values already form a coherent scale — this is a naming exercise, not a redesign.

## Shadow / Elevation

One token today (`--shadow`), used for cards. Fine for current surface count. Before modals/toasts/menus (Priority 7) are built, add elevation tiers — a modal needs to sit visually above a card, which a single shared shadow value can't express:

`--shadow-sm` (current `--shadow`, for cards) · `--shadow-md` (dropdowns, popovers) · `--shadow-lg` (modals, dialogs)

## Grid / Breakpoints

Not yet defined anywhere in the codebase — every page today is effectively a single centered column (`max-width: 380px` auth card, `max-width: 560px` profile/feed card) with no responsive behavior tested at other viewports. This is the single largest gap between the current implementation and "world-class" — see `docs/foundations/RESPONSIVE_LAYOUT.md` for the breakpoint scale and how layouts should adapt. Do not add new fixed-width containers without registering them there.

## Components (current inventory)

See `docs/foundations/COMPONENT_LIBRARY.md` for the full inventory and what's still missing. Summary of what exists today, styled via shared classes in `globals.css`: `.button` / `.buttonSecondary` / `.iconButton`, `.field` / `.textInput`, `.authCard`, `.profileCard` / `.profileHeaderRow` / `.profileAvatar` / `.profileLinkItem` / `.profileEditToggle`, `.siteHeader`, `.errorText` / `.mutedText`.

**Known inconsistency to fix, not perpetuate:** several pages (`SiteHeader.tsx`, `[username]/page.tsx`) use inline `style={{...}}` for layout (flex gaps, margins) instead of a class. This works today because the app is small, but it's already the first crack in "one visual language" — new layout patterns used more than once should become a class (e.g. a `.stack` / `.row` utility) rather than a repeated inline object literal. Don't do a wholesale retrofit unprompted; apply the rule going forward and clean up opportunistically when touching a file anyway.

## Motion

Currently: `0.15s ease` for color/border/shadow transitions (inputs, buttons, link items), `0.05s ease` translateY for button press feedback. No entrance/exit animation exists yet (no modals/toasts to animate). Formalize as tokens once those components exist: `--transition-fast: 0.05s ease` (press feedback), `--transition-base: 0.15s ease` (hover/focus states), `--transition-slow: 0.25s ease` (panel/modal enter-exit). Respect `prefers-reduced-motion` — not yet handled anywhere; see `docs/foundations/ACCESSIBILITY.md`.

## Dark Mode

Three-layer system, already implemented and working: OS preference (`@media (prefers-color-scheme: dark)`) as the default, overridable in either direction by an explicit `data-theme="light"|"dark"` attribute on `<html>` set via the header logo toggle + `localStorage`, with `suppressHydrationWarning` handling the pre-hydration script's unavoidable SSR/client mismatch. New CSS variables must always be defined in all three places (`:root`, the dark media query, and both `data-theme` overrides) — a token defined in only one will silently break theme switching.

**Logo/theme pairing is intentional and non-standard:** dark theme shows the dark-fill mark (`0dot.png`), light theme shows the light-fill mark (`1dot.png`) — confirmed twice by explicit user direction, the reverse of the conventional higher-contrast pairing. Do not "fix" this back to the conventional pairing without being told to.

## Accessibility

Color contrast, focus indicators, and reduced motion are design-system concerns as much as engineering ones — see `docs/foundations/ACCESSIBILITY.md` for the full standard. Minimum bar for any new component added to this system: visible focus state (the `--accent` + `--accent-soft` ring pattern already used on inputs), 44×44px minimum touch target for anything tappable, and contrast checked against both light and dark token values before shipping.
