# 0dot.in — UX Guidelines

Status: Foundational document. Non-negotiable interaction rules — every new feature is checked against this list before it ships, not just at the end.

## Non-Negotiable Rules

1. **Every action must provide feedback.** No button click, form submit, or toggle should leave the user wondering if it worked. Current pattern to reuse: `useActionState` + inline `.errorText` for failures, optimistic-feeling UI for toggles (the like button already does this via server-rendered `aria-pressed` state re-render on `revalidatePath`). Silent failures are bugs.
2. **No page should take more than three taps/clicks to reach** from anywhere in the primary nav. `docs/foundations/NAVIGATION.md`'s sidebar/bottom-nav structure is now live — re-verify this explicitly as more destinations are added to it, rather than assuming it stays trivially true.
3. **Primary actions stay visible**, not buried in overflow menus. Compose (feed), Edit profile, Add link are all already surfaced directly rather than behind a menu — keep that pattern for new primary actions (e.g. future "Follow" button, "Message" button).
4. **Touch targets are at least 44×44px.** Applies to icon buttons especially — `.iconButton` today is visually small (`0.35rem 0.55rem` padding); verify its actual hit area meets 44px before it ships to a touch context, padding the tap target invisibly if the visual size needs to stay small.
5. **Minimize cognitive load.** Forms ask for the minimum required fields at each step (signup already collects only displayName + username + email + password, no unnecessary fields). Don't add a field "while we're in there" without a concrete use for it.
6. **Progressive disclosure for advanced/owner-only features.** Already the pattern for Edit Profile (`<details>` disclosure, closed by default) and for owner-only controls (reorder/delete only render for the profile owner, not shown-then-disabled for visitors). Extend this pattern rather than inventing a new one — e.g. future business/community admin controls should default collapsed, not visible-but-locked.
7. **Consistent navigation across devices.** The same primary destinations (Feed, Profile, Search, Notifications, Messages once built) are reachable the same way conceptually on mobile and desktop, even though the chrome differs (bottom nav vs. sidebar) — see `docs/foundations/NAVIGATION.md`.
8. **Errors are specific and actionable**, never generic. Current examples to hold the line on: `"Username must be 3-30 characters: letters, numbers, underscore only."` not `"Invalid input."`; `UsernameField`'s live availability check (`checking`/`available`/`taken`/`reserved`/`invalid`/`network_error`, see `docs/foundations/USER_JOURNEYS.md`) is a newer example of the same bar applied to a background check, not just a submit-time error. Every new validation error follows this specificity bar.
9. **Destructive actions require explicit confirmation**, and the confirmation UI explains the consequence, not just "are you sure?" `ConfirmButton`/`Modal` (see `COMPONENT_LIBRARY.md`) is the pattern to reuse — wired into the profile Links page's link/social-link delete buttons today, with other delete flows across the app still needing the same sweep, not yet done everywhere. Account deletion itself still doesn't exist (see `USER_JOURNEYS.md`) — that's the one delete flow with no confirmation UI to check yet, precisely because there's no flow at all.
10. **Empty states are designed, not blank.** Already followed (`"No links yet."`, `"No posts yet."`) — every new list/collection view needs an explicit empty-state message before it ships, not a blank `<div>`.
11. **Loading states never show a blank flash.** Server Components render already-populated HTML on first paint for most of today's pages; as client-side data fetching is introduced (search-as-you-type, infinite scroll), skeleton/loading states must be designed alongside the feature, not bolted on after.
12. **Never require a page reload to see the result of an action.** Current pattern (`revalidatePath` after every mutating Server Action) already guarantees this — keep using it rather than reaching for full navigation/reload as a way to "refresh" state.

## How This Interacts With Other Foundation Docs

- Visual compliance with these rules (focus states, contrast, spacing) is defined in `DESIGN_SYSTEM.md`.
- Concrete task flows this ruleset applies to are enumerated in `docs/foundations/USER_JOURNEYS.md`.
- Accessibility-specific rules (keyboard nav, screen reader, reduced motion) live in `docs/foundations/ACCESSIBILITY.md` rather than being duplicated here.
