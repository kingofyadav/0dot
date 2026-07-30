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
| Site header | `src/components/SiteHeader.tsx` | Sticky, tricolor gradient underline, auth-state-aware |
| Auth tabs | `src/components/AuthTabs.tsx` | Signup/login single-view switcher |
| Profile card / avatar ring | `.profileCard`, `.profileAvatar` | Gradient-ring border trick |
| Link item (link-in-bio row) | `.profileLinkItem` | Used only on profile page currently |
| Post card | `src/components/PostCard.tsx` | Used on both `/feed` and profile Posts section — good example of the "avoid page-specific components" rule already being followed |
| Compose box | `src/app/feed/ComposeBox.tsx` | Currently feed-page-specific; will need to become shared once posting is possible from other surfaces (e.g. a community) |
| Disclosure (expand/collapse) | `.profileEditToggle` (styled `<details>`) | Currently only used for Edit Profile |

## Missing (needed before the next few phases)

| Component | Needed for | Priority |
|---|---|---|
| **Modal / dialog** | Confirmations (delete account, destructive actions per `UX_GUIDELINES.md` #9), any focused task that shouldn't navigate away | High — first destructive-action flow (Phase 12) blocks on this |
| **Toast / inline notification** | Non-blocking feedback ("Link added", "Copied to clipboard") — today, feedback is only via full page re-render (`revalidatePath`), which works but doesn't scale to lightweight confirmations | Medium |
| **Tabs** | Profile sub-sections once Media/Articles/Projects/Store land (Phases 6/7/9) | Medium — needed once IA's profile sub-navigation grows past Posts+Links |
| **Menu / dropdown** | Overflow actions once primary-action space runs out (`UX_GUIDELINES.md` #3 — only for genuinely secondary actions) | Low for now |
| **List** (generic, virtualized-ready) | Feed and profile Posts currently render full unpaginated lists (`take: 50`, no cursor) — needs to become a real paginated/virtualized list before performance targets in `PERFORMANCE.md` are at risk | High — tied to infinite scroll |
| **Avatar (standalone, sizeable)** | Currently avatar rendering is inlined per-page (profile page has its own `<img>`/`Logo` branching); extract into a shared `Avatar` component before it's needed a third time (e.g. comment threads, follower lists) | Medium |
| **Media viewer** | Image/video posts (Phase 1 named "image/video posts" as a Feed feature — not yet built; current `Post` model is text-only) | High — blocks a named Phase 1 feature |
| **Rich text editor** | Articles (Phase 7) | Low — not until Phase 7 |
| **Comment thread** | Post comments (Phase 1 named "comment" as a Feed feature — not yet built; `PostLike` exists, no `Comment` model yet) | High — blocks a named Phase 1 feature |
| **Form field variants** (select, checkbox, radio, toggle switch) | Settings (Phase 1/12), any future preference UI | Medium |
| **Empty state** (as a real component, not ad hoc `<p className="mutedText">`) | Consistency per `UX_GUIDELINES.md` #10 — currently each empty state is hand-written per page | Low, but cheap to fix now before more pages copy the ad hoc pattern |

## Rule

New components go in `src/components/`, styled via `globals.css` custom-property tokens (see `DESIGN_SYSTEM.md`) — never a component-scoped hardcoded color/spacing value. A component used on only one page today but conceptually generic (e.g. `ComposeBox`) should still be written as if it'll be reused, since the pattern in this codebase (`PostCard`) shows that reuse tends to arrive within the same project phase, not years later.
