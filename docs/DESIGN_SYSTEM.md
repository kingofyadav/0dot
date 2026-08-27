# 0dot.in — Design System

Status: Foundational document. `src/app/globals.css` is the source of truth for tokens already implemented — this document explains, formalizes, and extends it. When they conflict, fix `globals.css` to match this document (or update this document if the CSS was the more deliberate recent decision) rather than leaving them silently inconsistent.

## Tooling — Tailwind CSS v4 + shadcn/ui

Added 2026-08, additive: Tailwind utility classes and shadcn/ui components are available for new work; no existing page or component was migrated to them. Setup is `postcss.config.mjs` + `@import "tailwindcss"` at the top of `globals.css` — Tailwind v4 is CSS-first, there is no `tailwind.config.js`.

Tailwind is wired directly onto the tokens above, not a second palette. In `globals.css`: a plain `@theme` block registers the non-themed tokens (`--text-*`, `--radius-*`, `--font-sans`/`--font-mono`) as real Tailwind scales, and a separate `@theme inline` block aliases the themed color/shadow tokens via `var()` (`--color-background: var(--background)`, etc.) so `bg-background` / `text-foreground` / `shadow-md` and similar utility classes keep tracking the same light/dark cascade as every hand-written rule below them — change a color in the `:root`/media/`data-theme` blocks and Tailwind utilities pick it up automatically, no separate edit needed.

**shadcn/ui token collision — read before running `npx shadcn add`.** shadcn's copied component source (lands in `src/components/ui/`) is written against its own token names: `bg-primary`, `bg-card`, `bg-popover`, `bg-destructive`, `bg-muted`, `bg-secondary`, `border-input`, `ring-ring`, `bg-accent`. Most are aliased onto our existing tokens rather than kept as a second neutral palette — `primary` → `--accent`, `card`/`popover` → `--surface`, `destructive` → `--danger`, `input`/`ring` → `--border`/`--accent` (see the `@theme inline` block in `globals.css`). The one deliberate exception: shadcn's `accent` means a neutral menu/dropdown hover background, a different concept from our primary brand color, so it's backed by its own `--ui-accent` token instead of aliasing straight to `--accent` — doing that would paint every future dropdown/select hover state blue, which isn't "restrained accent system." When a new `npx shadcn add` pulls in a token this project doesn't have yet (`chart-*` and `sidebar-*` were dropped as unused during setup), alias it onto an existing token the same way rather than accepting shadcn's generic OKLCH gray defaults — check the `:root` and `@theme inline` blocks in `globals.css` for the pattern first.

`dark:` utilities on shadcn components are backed by a custom `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` matching this project's attribute-based theming, not Tailwind's default `.dark`-class variant. It only fires on an *explicit* theme toggle, not on OS-preference-only dark mode — that path is already covered for every token-backed utility via the `@theme inline` color aliases above, without needing the variant. A `dark:` utility applied to something that isn't token-backed won't respond to OS preference alone; a known, accepted gap rather than an oversight.

## Color

**Rebranded 2026-08.** Google's 4-color palette (Blue `#4285F4`, Red `#EA4335`, Yellow `#FBBC04`, Green `#34A853`), used as a **semantic system**, not four decorative brand hues: Blue is the one primary interactive color (buttons, focus rings, links-as-actions, active nav state); Red/Yellow/Green are reserved for status (danger/warning/success) and are deliberately *not* used decoratively elsewhere — a yellow badge should always mean "warning," never just "brand accent." This replaces the previous Indian-tricolor-inspired scheme (saffron/green/navy, sourced from the `0dot`/`1dot` logo marks) per explicit product direction. The one deliberate exception to "no decorative status-color use": `.railPlanCard` (the premium/upgrade promo card) keeps a two-hue blue→green gradient for a bit of extra richness on that one moment, evoking Google's own multi-color mark — red/yellow are excluded from it since they'd misread as an actual warning/error on an upgrade card.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f5f4f1` | `#0a0a0a` | Page background |
| `--foreground` | `#171717` | `#ededed` | Primary text |
| `--surface` | `#fbfaf8` | `#131313` | Cards, header, raised elements |
| `--border` | `rgba(23,23,23,.12)` | `rgba(237,237,237,.12)` | Hairlines, card/input borders |
| `--accent` | `#4285f4` (Blue 500) | `#8ab4f8` (Blue 300) | Primary interactive color (buttons, focus rings, links-as-actions, verified badge) |
| `--accent-strong` | `#1a73e8` (Blue 600) | `#669df6` (Blue 400) | Hover/active state of `--accent`; also used for decorative two-tone-blue treatments (header gradient bar, hamburger icon, bottom-nav FAB, sidebar/rail borders) that previously mixed in orange/navy |
| `--accent-soft` | `rgba(66,133,244,.14)` | `rgba(138,180,248,.18)` | Focus rings, subtle backgrounds |
| `--success` | `#34a853` (Green 500) | `#81c995` (Green 300) | Success/positive status only — not a decorative accent |
| `--success-soft` | `rgba(52,168,83,.14)` | `rgba(129,201,149,.18)` | Success subtle backgrounds |
| `--warning` | `#fbbc04` (Yellow 500) | `#fbbc04` (same — see note below) | Warning/caution status only. **Never as bare colored text** — measures ~1.6:1 against light-mode `--background`, failing WCAG AA badly as plain text, even though it clears AA easily as a filled badge (~10.5:1 with `--on-warning` text) or as an icon/text color against the dark-mode background (~11.6:1). Always render as a filled badge/icon/border. |
| `--warning-soft` | `rgba(251,188,4,.14)` | `rgba(251,188,4,.18)` | Warning subtle backgrounds |
| `--danger` | `#ea4335` (Red 500) | `#f28b82` (Red 300) | Danger/destructive status only |
| `--danger-soft` | `rgba(234,67,53,.14)` | `rgba(242,139,130,.18)` | Danger subtle backgrounds |
| `--on-accent` / `--on-success` / `--on-warning` / `--on-danger` | `#171717` (all four) | `#171717` (all four) | Text/icons on the matching color's own surface (buttons, badges). Near-black clears AA against all four in both themes — Blue 5.0:1, Green 5.9:1, Red 4.6:1 (tightest margin — re-verify if `--danger` is ever retuned), Yellow 10.5:1 — while white fails against every one of them in light mode. Kept as four separate tokens (not aliased to one shared value) so a future per-color retune doesn't have to unpick a shared token. |
| `--shadow` | 2-layer soft shadow | deeper/darker equivalent | Card elevation |
| `--shadow-md` | mid soft shadow | deeper/darker equivalent | Dropdowns, popovers |
| `--shadow-lg` | large soft shadow | deeper/darker equivalent | Modals, dialogs (`Modal.tsx`) |

**Rule:** never hardcode a hex value in a component. Every color reference goes through a CSS variable. This is already followed everywhere in the current codebase (the two exceptions — `browser-tab.ts`'s `<canvas>`-drawn favicon badges, which can't read CSS custom properties — are hardcoded on purpose and documented inline as tracking the palette above manually) — keep it that way as new components are added.

**Yellow doesn't need a separate dark-mode tier.** Every other token above gets its own lighter/desaturated dark-mode value (see "dark mode is not simply inverted" below) — Yellow 500 is the one exception, verified to still clear AA as a badge fill or icon/text color against the near-black dark background without retuning, so the same hex is used in both themes deliberately, not by oversight.

**Fixed 2026-08 (carried forward from the previous palette): primary/danger button text contrast.** The pre-rebrand scheme had the same class of bug (`.button`'s white text on the old accent measured ~2.1–2.8:1, failing WCAG AA's 4.5:1) — the four `--on-*` tokens above are this rebrand's version of that same check, done up front per color rather than discovered after shipping. Verify any new color used as a button/badge background against its actual text color in both themes before shipping, not just the background against the page.

**Dark mode is not simply inverted.** Dark-mode accent values are individually tuned (lighter/more saturated) for contrast against a near-black surface, not derived mechanically from the light values. Any new token added to the palette needs its own dark-mode value chosen for contrast, not an auto-inverted one — Yellow above is a verified exception, not the default assumption.

## Typography

`var(--font-geist-sans)` (Geist, via `next/font`). Implemented as real CSS variables in the `@theme` block in `globals.css` (also registered as Tailwind's `text-xs`…`text-3xl` scale) — no longer ad hoc per-element sizing:

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 0.8rem | Meta text, timestamps, labels |
| `--text-sm` | 0.9rem | Body secondary, muted text, form labels |
| `--text-base` | 1rem | Body default |
| `--text-lg` | 1.1rem | Section headings (e.g. "Posts") |
| `--text-xl` | 1.4rem | Card/page headings (e.g. auth heading) |
| `--text-2xl` | 1.6rem | Profile display name |
| `--text-3xl` | 2.25rem | Marketing/landing headlines (`"/"`'s hero `h1`) — the first consumer of the token this doc originally reserved it for |

Not yet retrofitted onto every pre-existing hand-written rem value outside these — this was the formalization pass the earlier version of this section called for, not a full sweep; new sizes should reach for a token, existing ones migrate opportunistically.

Font weight: `400` body, `500` labels, `600` interactive/emphasis (buttons, links-as-actions, meta emphasis), `700` headings. Already followed consistently — formalize as the rule, don't add new weights.

Monospace: `var(--font-geist-mono)` (Geist Mono, via `next/font`), registered as `--font-mono` in `globals.css` and wired to Tailwind's `font-mono`. Used for API keys, code snippets, and a deliberate brand-string treatment (`0` vs `O` legibility). The "not yet chosen" gap this line used to flag — called out as needed before Phase 10 — is closed.

## Spacing

No formal scale exists yet — current CSS uses direct rem values (`0.35rem`, `0.5rem`, `0.75rem`, `0.85rem`, `1.1rem`, `1.25rem`, `1.5rem`, `1.75rem`, `2rem`) chosen per-instance. Formalize as an 4px-based scale before the component library expands:

`--space-1: 0.25rem` (4px) · `--space-2: 0.5rem` (8px) · `--space-3: 0.75rem` (12px) · `--space-4: 1rem` (16px) · `--space-5: 1.25rem` (20px) · `--space-6: 1.5rem` (24px) · `--space-8: 2rem` (32px) · `--space-10: 2.5rem` (40px)

## Radius

Implemented: `--radius-sm: 8px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-full: 9999px` (in the `@theme` block in `globals.css`, so Tailwind's `rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-full` resolve to the same values as `var(--radius-*)`). Existing hand-written CSS (icon buttons, buttons/inputs, link items at `12px`, cards, `50%` avatars) hasn't been retrofitted onto these variables — this was a naming/Tailwind-wiring exercise, not a redesign; consuming the tokens in the pre-existing hand-written rules is still open if it's ever worth the diff.

## Shadow / Elevation

Three tiers, implemented: `--shadow` (cards — the original single token, kept as-is rather than renamed to `--shadow-sm` to avoid a blanket rename across every existing card), `--shadow-md` (dropdowns, popovers — not yet consumed by anything, reserved for when a dropdown/popover component is built), `--shadow-lg` (modals — `Modal.tsx`).

## Grid / Breakpoints

Most of the app is still a single centered column (`max-width: 380px` auth card, `max-width: 560px` profile/feed card) with no responsive behavior tested at other viewports. The first real exception: the marketing landing sections (`src/components/marketing/*`, `"/"` only) implement the literal breakpoint scale from `docs/foundations/RESPONSIVE_LAYOUT.md` (480/768/1024/1280/1536, mobile-first) end to end — `MarketingNav`'s collapse to a `<details>` mobile menu at 768px is the first genuinely responsive multi-breakpoint component in the codebase. Everywhere else still only branches at 1024px (`RESPONSIVE_LAYOUT.md`'s `--bp-lg`), the one breakpoint the rest of the app has ever used. Do not add new fixed-width containers without registering them in `RESPONSIVE_LAYOUT.md`. Tailwind's default breakpoints (`sm`/`md`/`lg`/`xl`/`2xl`) are available (see Tooling above) but haven't been reconciled with `RESPONSIVE_LAYOUT.md`'s scale — check that doc before reaching for a `md:`/`lg:` prefix, rather than assuming Tailwind's defaults are this project's breakpoints. `globals.css`'s own convention: literal pixel values in `@media`, not `var()` — custom properties don't resolve inside media-query conditions.

## Components (current inventory)

See `docs/foundations/COMPONENT_LIBRARY.md` for the full inventory and what's still missing. Summary of what exists today, styled via shared classes in `globals.css`: `.button` / `.buttonSecondary` / `.iconButton`, `.field` / `.textInput`, `.authCard`, `.profileCard` / `.profileHeaderRow` / `.profileAvatar` / `.profileLinkItem` / `.profileEditToggle`, `.siteHeader`, `.errorText` / `.mutedText`, `Modal.tsx` / `ConfirmButton.tsx` (`.modal`), `Toast.tsx` (`.toastStack`/`.toast`), `Avatar.tsx`, `EmptyState.tsx` (`.emptyState`). `src/components/ui/` (shadcn/ui, see Tooling above) is a second, separate inventory going forward for anything Radix-primitive-shaped — `button`, `dropdown-menu`, `popover`, `select`, and `tabs` are pulled in so far (app-level consumers: `AccountMenu`, `ConversationRowMenu`, `MobileNavMenu`, …). Prefer these over adding another one-off `.button`-style class or a hand-rolled disclosure; the two systems coexist rather than one replacing the other yet. See `COMPONENT_LIBRARY.md` for the full inventory.

**Known inconsistency, partly addressed:** `.stack`/`.stack-sm`/`.stack-lg`/`.row`/`.row-sm`/`.row-lg` utility classes now exist in `globals.css` and `SiteHeader.tsx` is down to one inline `style`. `src/app/[username]/page.tsx` still carries ~46 inline `style={{...}}` layout objects — the remaining concentration. Reach for the utility classes for new layout patterns; clean up the profile page opportunistically, not in a wholesale retrofit. See `DESIGN_CONSISTENCY.md`.

## Motion

Implemented as real CSS variables in the `@theme` block in `globals.css`: `--transition-fast: 0.05s ease` (press feedback), `--transition-base: 0.15s ease` (hover/focus states — inputs, buttons, link items, `DigitalHomeVisual`'s node hover/tooltip), `--transition-slow: 0.25s ease` (panel/modal enter-exit, reserved for the marketing sections' panel-level transitions). Not yet retrofitted onto every pre-existing hand-written `0.15s ease`/`0.05s ease` value outside the new marketing/`DigitalHomeVisual` CSS — same opportunistic-migration posture as Typography above. A blanket `prefers-reduced-motion: reduce` override (zeroes animation/transition duration) is implemented globally; see `docs/foundations/ACCESSIBILITY.md`.

## Dark Mode

Three-layer system, already implemented and working: OS preference (`@media (prefers-color-scheme: dark)`) as the default, overridable in either direction by an explicit `data-theme="light"|"dark"` attribute on `<html>` set via the header logo toggle + `localStorage`, with `suppressHydrationWarning` handling the pre-hydration script's unavoidable SSR/client mismatch. New CSS variables must always be defined in all three places (`:root`, the dark media query, and both `data-theme` overrides) — a token defined in only one will silently break theme switching.

**Logo/theme pairing is intentional and non-standard:** dark theme shows the dark-fill mark (`0dot.png`), light theme shows the light-fill mark (`1dot.png`) — confirmed twice by explicit user direction, the reverse of the conventional higher-contrast pairing. Do not "fix" this back to the conventional pairing without being told to.

## Accessibility

Color contrast, focus indicators, and reduced motion are design-system concerns as much as engineering ones — see `docs/foundations/ACCESSIBILITY.md` for the full standard. Minimum bar for any new component added to this system: visible focus state, 44×44px minimum touch target for anything tappable, and contrast checked against both light and dark token values before shipping.

**Implemented 2026-08:** a global `:focus-visible` outline (`var(--accent)`, 2px, offset 2px) on every `a`/`button`/`summary`/`[tabindex]` — not just inputs, which previously had the only explicit focus style and relied on the inconsistent browser default everywhere else. A skip-to-content link (`.skipLink`, targets `#main-content`) and a blanket `prefers-reduced-motion: reduce` override are also now in `globals.css`. See `docs/foundations/ACCESSIBILITY.md` for the up-to-date audit.
