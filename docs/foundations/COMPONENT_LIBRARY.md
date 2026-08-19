# Component Library

Status: Foundational document (Priority 7). Inventory of what exists today plus what's needed. Rule: avoid page-specific components whenever a pattern repeats — if a second page needs something close to an existing component, extend the shared one rather than forking a new one-off.

## Built Today

| Component | File | Notes |
|---|---|---|
| Button (primary) | `.button` in `globals.css` | Used everywhere; `--accent` background |
| Button (secondary) | `.button.buttonSecondary` | Outline style |
| Icon button | `.button.iconButton` | Used for reorder/delete controls; verify 44px hit area per `UX_GUIDELINES.md` #4 |
| Text input / textarea | `.field`, `.textInput` | Shared focus-ring styling |
| Logo (static) | `src/components/Logo.tsx` | Theme-aware image swap, used as avatar fallback |
| Theme toggle logo | `src/components/ThemeToggleLogo.tsx` | Interactive; header-only; owns the `data-theme`/favicon/localStorage logic |
| Site header | `src/components/SiteHeader.tsx` | Sticky, tricolor gradient underline, auth-state-aware; explicitly skips `/`, `/login`, `/signup` (see `isChromelessPath`, `route-context.ts`) |
| Marketing nav | `src/components/marketing/MarketingNav.tsx` | Landing-page-only (`"/"`) header: logo, Log in / Create your 0dot, `<details>`-based mobile menu. Not `SiteHeader` — this sits above the hero on the one page that doesn't already have its own auth form front and center |
| Auth top bar | `src/components/AuthTopBar.tsx` | `/login` and `/signup`'s own small top bar: logo + "Back to 0dot" link. Replaces the old standalone `.landingLogo` on those two pages; deliberately not the full `MarketingNav` — these stay single-purpose task pages |
| Digital home visual | `src/components/DigitalHomeVisual.tsx` | The "identity → home → links/content/community/business" product metaphor: a themed CSS/DOM radial layout of real `<a>`/`<button>` nodes (no WebGL/SVG), `hero` variant (pointer parallax, hover expansion, on `"/"`) vs. `calm` variant (idle motion only, on `/login`/`/signup`) |
| Explore live link | `src/components/ExploreLiveLink.tsx` | The `/explore` CTA link+dot, extracted once the same JSX was duplicated identically across `"/"`, `/login`, `/signup` |
| Profile card / avatar ring | `.profileCard`, `.profileAvatar` | Gradient-ring border trick |
| Link item (link-in-bio row) | `.profileLinkItem` | Used only on profile page currently |
| Post card | `src/components/PostCard.tsx` | Used on both `/feed` and profile Posts section — good example of the "avoid page-specific components" rule already being followed |
| Compose box | `src/app/feed/ComposeBox.tsx` | Currently feed-page-specific; will need to become shared once posting is possible from other surfaces (e.g. a community) |
| Disclosure (expand/collapse) | `.profileEditToggle` (styled `<details>`) | Currently only used for Edit Profile |
| Modal / dialog | `src/components/Modal.tsx` | Native `<dialog>`, themed via `.modal`/`--shadow-lg`. Free focus trap, Escape-to-close, focus-return via the platform. |
| Confirm button | `src/components/ConfirmButton.tsx` | Wraps Modal for the destructive-confirmation pattern (`UX_GUIDELINES.md` #9). Wired into the profile Links page's link/social-link delete buttons; other delete flows (see grep for `"Delete"`/`"Block"` across `src/app`) still need this — a Phase-4-style sweep, not yet done everywhere. |
| Toast | `src/components/Toast.tsx` (`ToastProvider`/`useToast`) | Mounted once at the root (`layout.tsx`), `aria-live="polite"`. Built as ready-to-use infra per this doc's own "write it as if it'll be reused" rule — not yet called from any page; adopt it the next time a lightweight non-navigating confirmation is needed. |
| Avatar | `src/components/Avatar.tsx` | Extracted from the profile page's avatar-with-fallback branching, also adopted by `UserListItem.tsx`. ~17 other `avatarUrl` call sites (messages, community members, etc.) still have their own inline version — migrate opportunistically, not in one sweep. |
| Empty state | `src/components/EmptyState.tsx` (`.emptyState`) | Replaces the ad hoc `<p className="mutedText">` pattern on the profile Links page (both the social-links and links empty states); most other empty states across the app haven't been migrated yet. |

## Superseded, left in place

`src/components/LandingLiveShowcase.tsx` (a rotating mockup-profile preview) was part of the previous `"/"` landing-page implementation and is no longer imported anywhere since the redesign (`MarketingNav` + `DigitalHomeVisual` replaced it; `.landingPreview` in `globals.css` is the matching dead CSS, also left in place). Not deleted — pre-existing component, not something to force out as a side effect of an unrelated rule. Delete outright if a future pass confirms nothing will ever reuse it.

**Correction:** this section previously also listed `src/components/AuthTabs.tsx` as superseded/unused — that was wrong. `AuthTabs` (the signup/login single-view switcher) is still actively imported and rendered by `src/app/page.tsx` as the homepage's own auth form; it was never replaced. A cleanup pass trusting the old text here would have deleted live homepage auth code.

## Missing (needed before the next few phases)

| Component | Needed for | Priority |
|---|---|---|
| **Tabs** | Profile sub-sections once Media/Articles/Projects/Store land (Phases 6/7/9) | Medium — needed once IA's profile sub-navigation grows past Posts+Links |
| **Menu / dropdown** | Overflow actions once primary-action space runs out (`UX_GUIDELINES.md` #3 — only for genuinely secondary actions) | Low for now — `MobileNavMenu.tsx` already covers the one place a dropdown-like disclosure is needed today; deliberately not generalized into a standalone `Dropdown` component without a second concrete caller (would be unused infra, not "written to be reused"). |
| **List** (generic, virtualized-ready) | Feed and profile Posts currently render full unpaginated lists (`take: 50`, no cursor) — needs to become a real paginated/virtualized list before performance targets in `PERFORMANCE.md` are at risk | High — tied to infinite scroll |
| **Rich text editor** | Articles (Phase 7) | Low — not until Phase 7 |
| **Form field variants** (select, checkbox, radio, toggle switch) | Settings (Phase 1/12), any future preference UI | Medium |

**Comment thread — closed.** Comments are live, implemented as `Post.replyToId` self-relation (not a separate `Comment` model) — a reply is structurally a `Post`, rendered inline under its parent via `PostCard`'s own reply handling. `MiniPostCard` (`PostCard.tsx`) is the flattened one-level-deep rendering for a reply/repost, per phase-1 spec §5.3.

**Media viewer — closed, partially.** Image posts now ship: `Post.media` (up to 4 images, `saveUploadedImage`/`@vercel/blob`), rendered by `PostMediaGrid` inside `PostCard.tsx`. Still a real gap against `PERFORMANCE.md` Rule 2 though — `PostMediaGrid` renders a plain `<img>` with no explicit width/height and no lazy-loading strategy, and `alt=""` (decorative) rather than meaningful alt text. Video posts remain unbuilt.

## Rule

New components go in `src/components/`, styled via `globals.css` custom-property tokens (see `DESIGN_SYSTEM.md`) — never a component-scoped hardcoded color/spacing value. A component used on only one page today but conceptually generic (e.g. `ComposeBox`) should still be written as if it'll be reused, since the pattern in this codebase (`PostCard`) shows that reuse tends to arrive within the same project phase, not years later.
