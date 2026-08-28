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
| Post card | `src/components/PostCard.tsx` | Used on `/feed`, `/explore`, `/trending`, profile Posts, and community feeds. **Redesign Phase 1** reworked the action row (D4): borderless icon+count `.postAction` pills (Like / Reply / Repost / Quote, Bookmark trailing) replacing the old bordered buttons with per-instance accent-border inline styles; Quote/Reply disclosures no longer force a full-width row when closed. `LikeButton.tsx` moved to `.postAction` too. **Redesign Phase 2:** the card itself gets `--border-strong` + a resting shadow (D3); the trailing action cluster (`.postHeaderActions` — Report + owner/mod controls) fades in on card hover/focus instead of sitting on every row (D4, `@media (hover: hover)` only — always shown on coarse pointers). Still open: author avatars on the byline. |
| Compose box | `src/app/feed/ComposeBox.tsx` | Currently feed-page-specific; will need to become shared once posting is possible from other surfaces (e.g. a community) |
| Disclosure (expand/collapse) | `.profileEditToggle` (styled `<details>`) | Currently only used for Edit Profile |
| Modal / dialog | `src/components/Modal.tsx` | Native `<dialog>`, themed via `.modal`/`--shadow-lg`. Free focus trap, Escape-to-close, focus-return via the platform. |
| Confirm button | `src/components/ConfirmButton.tsx` | Wraps Modal for the destructive-confirmation pattern (`UX_GUIDELINES.md` #9). The "world-class UI/UX pass" swept it across the app — ~40 importers now (delete/block/leave/revoke flows), not just the profile Links page. |
| Toast | `src/components/Toast.tsx` (`ToastProvider`/`useToast`) | Mounted once at the root (`layout.tsx`), `aria-live="polite"`. Now in real use — `ReportButton.tsx` and `KeyboardShortcutProvider.tsx` both call `useToast()`. No longer unused infra. |
| Avatar | `src/components/Avatar.tsx` | Extracted from the profile page's avatar-with-fallback branching, also adopted by `UserListItem.tsx`. ~17 other `avatarUrl` call sites (messages, community members, etc.) still have their own inline version — migrate opportunistically, not in one sweep. |
| User list item | `src/components/UserListItem.tsx` | Shared row for any list of users (followers, following, suggested, blocked). **Redesign Phase 2** added `compact` (smaller avatar, no verified badge, `buttonSmall` follow) for the 320px contextual rail, which was truncating names mid-word (D10). |
| Empty state | `src/components/EmptyState.tsx` (`.emptyState`) | ~80 importers. **Redesign Phase 1** gave it real hierarchy — optional `icon` (lucide component, shown in a soft disc), `title` + `description`, `action` slot. The old `message` prop still works (maps to `title`), so every existing call site upgraded for free; new ones pass `icon`/`description`. |
| Page header | `src/components/PageHeader.tsx` (`.pageHeader`) | **Redesign Phase 1.** `eyebrow` + `title` (`--text-3xl`) + `description` + `actions` slot. Supersedes the older `.pageHeaderRow`/`.pageHeading` pair and the ~64 inline `fontSize: "1.1rem", fontWeight: 700` page titles — adopted per-route in redesign Phase 2, not retrofitted wholesale. |
| Icon | `src/components/Icon.tsx` | **Redesign Phase 1.** `<Icon as={Bell} size="sm\|md\|lg" />` → 16/20/24px, stroke 1.75. The one place the size/stroke convention lives (D9). |

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
