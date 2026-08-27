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
| Confirm button | `src/components/ConfirmButton.tsx` | Wraps Modal for the destructive-confirmation pattern (`UX_GUIDELINES.md` #9). The "world-class UI/UX pass" swept it across the app — ~40 importers now (delete/block/leave/revoke flows), not just the profile Links page. |
| Toast | `src/components/Toast.tsx` (`ToastProvider`/`useToast`) | Mounted once at the root (`layout.tsx`), `aria-live="polite"`. Now in real use — `ReportButton.tsx` and `KeyboardShortcutProvider.tsx` both call `useToast()`. No longer unused infra. |
| Avatar | `src/components/Avatar.tsx` | Extracted from the profile page's avatar-with-fallback branching, also adopted by `UserListItem.tsx`. ~17 other `avatarUrl` call sites (messages, community members, etc.) still have their own inline version — migrate opportunistically, not in one sweep. |
| Empty state | `src/components/EmptyState.tsx` (`.emptyState`) | Now the standard across the app — ~80 importers after the design-system-adoption pass. The ad hoc `<p className="mutedText">` empty state is no longer the common case. |

## Superseded, left in place

`src/components/LandingLiveShowcase.tsx` (a rotating mockup-profile preview) was part of the previous `"/"` landing-page implementation and is no longer imported anywhere since the redesign (`MarketingNav` + `DigitalHomeVisual` replaced it; `.landingPreview` in `globals.css` is the matching dead CSS, also left in place). Not deleted — pre-existing component, not something to force out as a side effect of an unrelated rule. Delete outright if a future pass confirms nothing will ever reuse it.

**Correction:** this section previously also listed `src/components/AuthTabs.tsx` as superseded/unused — that was wrong. `AuthTabs` (the signup/login single-view switcher) is still actively imported and rendered by `src/app/page.tsx` as the homepage's own auth form; it was never replaced. A cleanup pass trusting the old text here would have deleted live homepage auth code.

## shadcn/ui inventory (`src/components/ui/`)

A second, Radix-primitive-shaped inventory (see `DESIGN_SYSTEM.md`'s Tooling section for the token bridging). Present today: `button`, `dropdown-menu`, `popover`, `select`, `tabs`. Prefer these over adding another one-off `.button`-style class or a hand-rolled disclosure for anything they cover; the two systems coexist rather than one replacing the other.

## Missing / status

| Component | Needed for | Status |
|---|---|---|
| **Tabs** | Profile sub-sections, settings groups | **Built** — `src/components/ui/tabs.tsx` (shadcn). Profile page still doesn't use tabs (content types are separate route trees, see `INFORMATION_ARCHITECTURE.md`), but the primitive exists. |
| **Menu / dropdown** | Overflow actions (`UX_GUIDELINES.md` #3) | **Built** — `src/components/ui/dropdown-menu.tsx` + `popover.tsx`; app-level consumers include `AccountMenu.tsx`, `ConversationRowMenu.tsx`, `MobileNavMenu.tsx`. |
| **List** (paginated) | Feed / profile Posts | **Built** — cursor pagination via `src/lib/pagination.ts`, "Load more" in `FeedList.tsx`. Not virtualized (plain link, not IntersectionObserver) — fine at current volume. Other lists (search, followers, messages) not yet on the helper. |
| **Form field variants** (select, checkbox, radio, toggle) | Settings, preference UI | **Partial** — `src/components/ui/select.tsx` built; checkbox/radio/toggle still hand-rolled per form. |
| **Rich text editor** | Articles (Phase 7) | Article authoring shipped (Phase 7) — check `src/app/s/[username]/content/*` for the editor actually in use before assuming this is still a gap. |

**Comment thread — closed.** Comments are live, implemented as `Post.replyToId` self-relation (not a separate `Comment` model) — a reply is structurally a `Post`, rendered inline under its parent via `PostCard`'s own reply handling. `MiniPostCard` (`PostCard.tsx`) is the flattened one-level-deep rendering for a reply/repost, per phase-1 spec §5.3.

**Media viewer — closed, partially.** Image posts ship: `Post.media` (up to 4 images, `saveUploadedImage`/`@vercel/blob`), rendered by `PostMediaGrid` inside `PostCard.tsx`, now with `loading="lazy"`, `decoding="async"`, and meaningful `alt` text (`"Image N posted by <author>"`). Remaining gap against `PERFORMANCE.md` Rule 2: no explicit width/height (blocked on storing dimensions at upload — `MediaItem` is just `{id, url}`). Video posts remain unbuilt.

**Note on scope.** `src/components/` now holds ~80 components — this table only tracks the shared primitives the design system owns, not every feature component. `git grep` the component name before assuming something isn't built.

## Rule

New components go in `src/components/`, styled via `globals.css` custom-property tokens (see `DESIGN_SYSTEM.md`) — never a component-scoped hardcoded color/spacing value. A component used on only one page today but conceptually generic (e.g. `ComposeBox`) should still be written as if it'll be reused, since the pattern in this codebase (`PostCard`) shows that reuse tends to arrive within the same project phase, not years later.
