# Addendum — Mobile Pro-Level Upgrade

Status: M1–M10, M12, M13, M14 built. M11's schema half already existed
pre-addendum (verified) and its missing admin trigger surface is now
built too (see §6) — only the legal-gated native-purchase flow and
finance-ops disbursement remain, neither buildable by this addendum
alone.
Owner: TBD
Related: [phase-15-mobile-apps.md](phase-15-mobile-apps.md), [phase-10-developer-platform.md](phase-10-developer-platform.md), [phase-2-social-platform.md](phase-2-social-platform.md)

## 1. Purpose & Scope

Phase 15 shipped the mobile app's foundation (OAuth/PKCE, push, universal
links) with a deliberately narrow feature surface: feed, single post,
profile, notifications, settings. This addendum takes it from that
foundation to feature breadth closer to the web app, plus a UI/UX pass —
"world-class pro level," not a token gesture at either. It's genuinely
multi-session-sized work (comparable to porting web phases 2/3/4/8/9), so it
is broken into sub-phases M1–M7, each independently shippable and testable,
following this repo's own "read the next sub-phase, build it" cadence.

**In scope (eventually):** Search/Explore, Bookmarks, Messages/DMs,
Communities, Businesses, Marketplace, Events, Wallet — plus a foundation
pass (design tokens, shared components, tab-bar restructure) everything
else builds on.
**Out of scope:** community chat/voice rooms (real bearer-token SSE
infra, its own design pass), native in-app-purchase integration (Phase 15
§6 — flagged there as needing dedicated legal/business work), wallet
top-up/payout (doesn't exist on web yet either — see M6).

## 2. Constraints that shaped every sub-phase below

- **No `/api/v1` route existed for any of Messages/Communities/Businesses/
  Marketplace/Events/Wallet before this addendum.** Every new mobile
  feature needs a matching route first, following the existing pattern
  exactly: `resolveApiRequest(request)` → `requireScope(ctx, "scope:key")`
  → `checkApiRateLimit(ctx.appId)` → `apiError(...)` (`src/lib/api-auth.ts`,
  `api-rate-limit.ts`; reference impl `src/app/api/v1/posts/route.ts`).
  Cursor pagination via `src/lib/pagination.ts` (`{ items, nextCursor }`).
- **OAuth scopes were half-provisioned already.** `src/lib/oauth.ts`
  pre-declared `events:read`, `marketplace:read`, `messages:read`,
  `messages:write`, `payments:read`. No scopes existed for communities or
  businesses. New scopes just get added to `OAUTH_SCOPES`;
  `ensureFirstPartyApps()` (`src/lib/first-party-apps.ts`) auto-approves
  every scope in that array for the first-party iOS/Android app on boot —
  no manual provisioning step per new domain.
- **All realtime today is in-memory SSE, cookie-session-only,
  single-process** (DMs, community chat, voice rooms, livestream chat).
  None of it is bearer-token-authenticated or safe to expose under
  `/api/v1` as-is. **Decision (M3): mobile Messages ships as REST polling +
  push-notification-driven refresh, not a live socket** — matches Phase 15
  §5.2's posture (scope v1 to simpler behavior, defer heavy realtime infra)
  and reuses the push pipeline already built. A bearer-token SSE upgrade is
  a clean fast-follow, not a blocker.
- **Wallet has a real gap even on web**: no code anywhere creates a
  `CoinTopUpRequest` or `CoinPayoutRequest` — only admin-approval actions
  exist. M6's wallet scope is limited to what actually exists and
  translates cleanly to a bearer-token route: balance and P2P transfer.
  VIP/Premium purchase turned out to need its own design pass too (see M6)
  and was deferred alongside top-up/payout, not built as originally
  scoped.

## 3. Sub-phases

### M1 — Foundation (built)

- `theme.ts` gained `shadow.{sm,md,lg}` (RN shadow-prop approximation of
  web's dual-layer `--shadow*`) and `motion.{fast,base,slow}` (mirrors
  `--transition-*`). `on*` text-on-color tokens already existed and needed
  no change.
- New shared components in `src/components/`: `Button`, `Chip`,
  `SegmentedControl`, `SearchBar`, `Card`, `BottomSheet`, `UserRow`,
  `ConversationRow` — built on existing primitives (`ListRow`'s
  press/haptic shell, `Skeleton`'s animation loop), not reinvented.
- Tab bar restructured from Home/Notifications/Settings to
  **Home/Explore/Messages/Notifications/Profile** — Profile absorbs the
  signed-in user's own profile (previously reached only via Settings' "View
  your profile" link) as a tab, matching X/Threads/Instagram's own pattern;
  Settings moved from a tab to a pushed screen (`app/settings.tsx`), reached
  via a gear icon on the Profile tab. `[username].tsx` and the new
  `(tabs)/profile.tsx` share one implementation (`src/screens/
  ProfileScreenBody.tsx`) rather than two copies to keep in sync by hand.
- Bookmarks, end to end: `engagement:write` scope's description widened
  ("Like, bookmark, and repost..." — bookmarking is exactly as low-stakes
  as a like, same scope-grain reasoning as that scope's original comment);
  `POST /api/v1/posts/[id]/bookmark` (toggle, mirrors like/repost),
  `GET /api/v1/bookmarks` (cursor-paginated list — cursors on
  `(createdAt, postId)` since `Bookmark`'s PK is composite, not a scalar
  `id`); `isBookmarked` added to every route that serializes a `Post`
  (feed, single post, profile posts, post creation); `app/bookmarks.tsx`
  screen (reachable from Settings) plus a bookmark icon on every `PostRow`
  and the post-detail screen.

### M2 — Search/Explore (built)

- `GET /api/v1/search?type=users|posts&q=...` — deliberately two tabs, not
  web search's eight (communities/businesses/events/marketplace have no
  mobile screen yet to navigate a result into, see M4/M5). Mirrors
  `search/page.tsx`'s own query shape and gating exactly: same
  `discoverableInSearch` flag, same `getPostVisibilityConditions`, same
  exact-then-prefix ranking for users.
- `app/(tabs)/explore.tsx` — `SearchBar` + `SegmentedControl` (People/
  Posts), 350ms debounce, cursor-paginated posts reusing `PostRow`, a new
  `UserRow` for people results.

### M3 — Messages/DMs (built)

- `GET /api/v1/conversations` (inbox, reuses `listInboxConversations`/
  `getConversationDisplayInfo`/`isConversationUnreadFor` from
  `src/lib/messaging.ts`), `POST /api/v1/conversations` (start a direct
  conversation + first message), `GET/POST /api/v1/conversations/[id]/
  messages` (list/send, text-only for this first cut — no attachment
  upload yet), `PATCH /api/v1/conversations/[id]/read` (stays under
  `messages:read`, same "marking read is a state change on your own read
  receipt" reasoning `notifications:read` already established),
  `GET /api/v1/conversations/candidates` (who you can message — reuses the
  same follow-graph pool `getMessageableCandidates` already serves the web
  new-DM picker).
- **Refactor**: `recordMessageAndNotify` (encrypt → create `Message` →
  update `Conversation`'s denormalized fields → un-hide participants →
  notify → publish SSE) moved from being private to `actions/messages.ts`
  into `src/lib/messaging.ts` as a shared export — both the web action and
  the new v1 route need this exact sequence, and duplicating anything
  touching message encryption is the one kind of duplication worth actively
  avoiding (a fix applied to one copy and not the other would be a silent
  plaintext-at-rest bug, not just cosmetic drift).
- Mobile: `app/(tabs)/messages.tsx` (inbox, 20s poll while focused),
  `app/messages/[id].tsx` (thread, inverted `FlatList`, 5s poll while
  focused, optimistic send), `app/messages/new.tsx` (candidate picker →
  compose first message). `resolvePath.ts` gained a `/messages/:id` branch
  so a message-notification tap or universal link opens the thread
  natively — the deferral phase-15 spec §4 named.

### M4 — Communities (built)

New `communities:read`/`communities:write` scopes (creating a post *inside*
a community reuses `posts:write` — same Post table, same consent-screen
meaning, not a third communities scope). `GET /api/v1/communities`
(joined + discover, mirrors `/c/page.tsx`), `GET /api/v1/communities/[slug]`
(detail + viewer membership + `canViewContent` via
`isGatedFromCommunityContent`), `POST`/`DELETE .../join` (mirrors
`joinCommunity`/`leaveCommunity` exactly, including the org-restricted
eligibility check and pending-vs-active status rule),
`GET/POST .../posts` (reuses `getCommunityFeedPosts` and
`resolvePostCommunityContext` directly from `lib/communities.ts` rather
than duplicating membership validation). Mobile: `app/communities.tsx`
(joined/discover sections), `app/community/[slug].tsx` (header, join/leave,
an inline text-only composer for active members, post feed reusing
`PostRow`). Community chat/voice rooms explicitly stay deferred — real
bearer-token SSE work, its own design pass, same posture as M3's realtime
decision.

### M5 — Businesses + Marketplace (built, browse-only)

New `businesses:read`/`businesses:write` (write declared, unused by mobile
v1 — reserved for a future business-owner flow, same "planted ahead of its
route" precedent `messages:read/write` set before M3), `marketplace:write`
(declared for a future native install/purchase flow; `marketplace:read`
already existed). **Scope reduction made while building this**: rather than
a native purchase/booking/contact flow per domain, `GET /api/v1/businesses`
+ `/api/v1/businesses/[slug]` and `GET /api/v1/marketplace` (wraps
`marketplace-browse.ts`'s existing six-category union — course/
digital_product/freelance_service/theme/template/app — wholesale, so mobile
gets full marketplace breadth, not just the raw `MarketplaceListing`
table's three categories) are **browse/detail only**; every purchase,
booking, contact-form, and review action hands off to the web page via
`expo-web-browser` (`app/business/[slug].tsx`'s "View full profile" button,
each marketplace item's own `href`). This isn't a partial implementation of
a bigger plan — it's the actual scope decision, consistent with Phase 15
§6 flagging native purchase flows as needing dedicated legal/business work,
not a routine implementation task.

### M6 — Events + Wallet (built, with two deferrals)

`events:write` scope (`events:read` already existed); `GET /api/v1/events`
(mirrors `listUpcomingEvents`), `GET /api/v1/events/[slug]` (reuses
`getEventBySlug`/`getMyRSVP`/`getRSVPCounts`), `POST .../rsvp` (mirrors
`rsvpToEvent` exactly, including the capacity check). Ticket *purchase*
stays a browser hand-off (`app/event/[slug].tsx`'s "Get tickets" button) —
same money-flow posture as M5, RSVP itself is free and fully native.
`payments:write` scope (send-side; `payments:read` already existed);
`GET /api/v1/wallet` (balance + merged sent/received `CoinTransfer`
history), `POST /api/v1/wallet/transfer` (mirrors `transferCoinsAction`
exactly, including the 20-coin cap and the same-transaction debit/credit/
ledger-row write). **Two deferrals beyond what M6 originally scoped**:
VIP/Premium purchase (`purchaseVipAction`) was deferred — it depends on
`requireOwnProfile`'s page-route-param auth shape, which doesn't translate
to a bearer-token API route without its own design pass; top-up/payout stay
deferred as originally planned (no user-facing flow exists on web either).
Mobile: `app/events.tsx`, `app/event/[slug].tsx`, `app/wallet.tsx` (balance
card, send-coins form, transfer history).

### M7 — Cross-cutting polish pass (built)

Pull-to-refresh added to every M4–M6 list screen that launched without it
(`communities.tsx`, `businesses.tsx`, `events.tsx`, `marketplace.tsx`,
`wallet.tsx` — M1–M3's screens already had it). `theme.shadow`/`theme.motion`
applied via `Card`/`BottomSheet` wherever M4–M6 needed elevation (wallet
balance card, marketplace item cards). `EmptyState` used on every list/
error state introduced this addendum, no exceptions. A `DiscoverHub`
component added to `app/(tabs)/explore.tsx` (shown before a search query is
typed) is the "categorized discovery hub" M1's plan called for — the actual
navigation surface tying Communities/Businesses/Marketplace/Events/Wallet/
Bookmarks together, since none of them fit in the 5-slot tab bar.
`resolvePath.ts` gained `/c/:slug`, `/b/:slug`, `/e/:slug` branches so
universal links and notification taps into any of these three domains open
natively instead of falling back to the browser.

One accepted, not fixed, lint finding: a newer `react-hooks/set-state-in-effect`
rule (bundled with this repo's Next.js ESLint config) flags a handful of
pre-existing files this addendum didn't touch (`Skeleton.tsx`,
`OfflineBanner.tsx`, `expoNotificationsModule.ts`, and `post/[id].tsx`'s
original `useEffect(() => { load(); }, [load])` pattern predating this
addendum) — confirmed via `git diff` to be pre-existing, not a regression
introduced here, and left as-is rather than opportunistically "fixed" as
part of an unrelated feature addendum.

## 4. What's still deferred (as of M7; superseded by §6's M8–M11 queue)

- Community chat and voice rooms — needs the bearer-token-aware SSE (or
  polling) design M3 explicitly deferred, applied a second time.
- Native purchase/booking/contact flows for businesses, marketplace
  listings, and event tickets — all currently browser hand-offs by
  deliberate scope decision (§3, M5/M6), not a gap to close casually; any
  move toward native purchase intersects Phase 15 §6's in-app-purchase
  compliance question and needs the same legal/business involvement that
  section calls for.
- Wallet top-up/payout and VIP/Premium purchase — blocked on, respectively,
  a web-side user-facing flow that doesn't exist yet, and a
  bearer-token-compatible redesign of `requireOwnProfile`'s auth shape.
- `businesses:write`/`marketplace:write` are declared and auto-approved for
  the first-party app but have no route using them yet — planted the same
  way `messages:read`/`write` were ahead of M3, for whichever future
  sub-phase adds native business-management or listing-creation on mobile.

## 5. Verification

- `mobile/`: `npx tsc --noEmit` (no dedicated typecheck script existed;
  `tsconfig.json` extends `expo/tsconfig.base` with `strict: true`).
- Root: `npm run lint` (ESLint) and `npm run test` (vitest) — new
  `/api/v1` routes and the `messaging.ts` refactor live in the root Next.js
  app.
- Manual: `expo start` against the local dev API for the new tab bar,
  bookmarks, search, and messages flows — native-app behavior isn't
  browser-testable here, so this is Expo Go/simulator verification, not
  claimed as browser-tested.

## 6. Next sub-phases (M8–M11)

Feature breadth is done as of M7 — every domain in scope (§1) has a mobile
screen. What's left is closing the gap between feature-complete and
pro-grade: reliability infra, interaction polish, the realtime limitation
M3 deliberately deferred, and the compliance question phase-15 §6 flagged
as high-stakes. All four tracks were requested together; they touch
different parts of the codebase and mostly don't block each other except
where noted.

### M8 — Reliability foundation (built)

- **PR-time CI.** New `.github/workflows/mobile-ci.yml`, triggered on
  `pull_request` and `push: main` path-filtered to `mobile/**` (mirrors
  `mobile-ota-update.yml`'s own path filter exactly), running `npm ci`,
  `npx tsc --noEmit`, `npm test`. Previously only `mobile-release.yml`
  ran these — gated behind a `mobile-v*.*.*` tag push or manual dispatch —
  so a broken mobile build could merge to `main` silently.
- **Test coverage on money- and session-moving paths**, three new suites
  alongside the 5 existing lib/util tests: `src/auth/__tests__/
  AuthContext.test.tsx` (the `loading → locked/signedOut/signedIn` state
  machine, the biometric-availability branch on restore, the 401-on-
  restore sign-out path, and the push-registration dedup/reset —
  none of which the lower-level `pkceAuth`/`client` tests exercise, since
  those only cover the token-refresh logic `AuthContext` calls into);
  `src/screens/__tests__/LockScreen.test.tsx` (Unlock and "Sign out
  instead" both reach their `AuthContext` action, and only their own);
  `app/__tests__/wallet.test.tsx` (the 20-coin `MAX_TRANSFER_COINS` cap
  rejects before any network call, "Review transfer" alone never calls
  `transferCoins` — only the confirm sheet's "Confirm & send" does, and
  the self-transfer guard). Cosmetic screens stay untested by choice.
  Two non-obvious fixes needed to get these green under the installed
  `@testing-library/react-native@14.0.1` (paired with React 19.2.3 /
  react-native 0.86.2): `render`, `renderHook`, and `fireEvent` are all
  **async** in this version (unlike older RNTL majors) — every call needed
  `await`, and `AuthContext`'s mount effect (which keeps doing async work
  after the initial render) needed `renderHook` itself wrapped in
  `act(async () => { ... })` or its later `setState` calls landed outside
  any act scope and React warned "environment not configured to support
  act" instead of the updates applying. `fireEvent.press` also needed to
  target the `Button`/`Pressable`'s own `accessibilityLabel`, not a nested
  `Text` child — pressing the child never reached the handler.
- **Crash reporting.** Installed `@sentry/react-native@^8.23.0` (`npx expo
  install --check` recommends `~7.11.0` off Expo's static compatibility
  table, but that predates React 19 support — 8.x's peer ranges
  (`react>=17`, `react-native>=0.65`, `expo>=49`) are satisfied cleanly by
  what's installed and `npm audit` reports 0 vulnerabilities, so the newer
  major was kept). `app.json` gained the `@sentry/react-native/expo`
  config plugin with `disableAutoUpload: true` (no `organization`/
  `project` exist yet — this avoids EAS builds attempting an
  authenticated source-map upload with no credentials configured).
  `src/config.ts` gained `SENTRY_DSN` (`EXPO_PUBLIC_SENTRY_DSN`, `null`
  until set — same env-var-indirection pattern `API_BASE_URL` already
  uses). `app/_layout.tsx` calls `Sentry.init({ dsn: SENTRY_DSN })` only
  when a DSN is present, and the default export becomes `Sentry.wrap
  (RootLayout)` (safe to leave unconditional — `wrap` just adds an error
  boundary/breadcrumbs layer that has nowhere to report to until a client
  is initialized). **Still needed, and not something this pass could do
  itself: create the actual Sentry project** (sentry.io), then set
  `EXPO_PUBLIC_SENTRY_DSN` (EAS secret + local `.env`) and, for
  symbolicated crash reports, `organization`/`project`/`authToken` in the
  plugin config with `disableAutoUpload` removed.
- Verification: `npx tsc --noEmit` clean, `npm test` — 51/51 passing
  across 8 suites, `npm audit` — 0 vulnerabilities, `npx expo export
  --platform web` — bundles successfully (the Sentry plugin logs an
  informational "Missing config for organization, project" note, expected
  given `disableAutoUpload`, not a build failure).

### M9 — Interaction polish (built)

- Installed `react-native-gesture-handler@~2.32.0` and
  `react-native-reanimated@4.5.1` via `npx expo install` (SDK-57-compatible
  versions resolved automatically). Reanimated 4 turned out to split its
  worklet transform into a separate `react-native-worklets` package —
  different from the `react-native-reanimated/plugin` setup its older
  majors used, and exactly the kind of drift `mobile/AGENTS.md` warns
  training data won't reflect, confirmed against Expo's and Reanimated's
  actual current docs rather than assumed. The project had **no**
  `babel.config.js` at all (Expo 57 applies `babel-preset-expo` implicitly
  until one exists) — `npx expo customize babel.config.js` materialized
  the default, then gained `plugins: ['react-native-worklets/plugin']`
  (must be last per that plugin's own docs). `app/_layout.tsx`'s
  `RootLayout` is now wrapped in `GestureHandlerRootView` — required at
  the app root for any gesture handler to receive touches at all.
- `BottomSheet` (`src/components/BottomSheet.tsx`) rewritten from RN's
  bare `Animated` to a Reanimated shared value (`translateY`) driving both
  the existing open/close animation and a new pan gesture on the handle
  only — not the whole sheet, so dragging doesn't fight a `TextInput` or
  `Button` living in the sheet's content (the wallet confirm sheet has
  both). Release past half the sheet's travel distance or a fast enough
  downward flick dismisses; otherwise it springs back open. The backdrop
  fades in step with the drag via the same shared value.
  `useReducedMotion()` (Reanimated's own hook, reading the same OS "Reduce
  Motion" signal `animateLayout.ts`'s cached-flag pattern does, just
  through the plumbing a worklet actually needs — a reactive UI-thread
  value, not a snapshot read once) skips the programmatic and
  settle-on-release animations; the live drag-follows-finger motion isn't
  gated, since that's direct manipulation, not an animation effect.
- `ConversationRow` gained a right-swipe "Mark as read" action, using
  gesture-handler's built-in `Swipeable` rather than a hand-rolled pan
  gesture. **Scope narrowed from the original plan**: "archive" has no
  backing route anywhere in the API (`grep` across `api/client.ts`
  confirmed only `PATCH /api/v1/conversations/[id]/read` exists for
  conversations) — inventing an archive action with nothing to call would
  be exactly the kind of half-finished feature this repo's conventions
  reject, so the swipe action is mark-read only, and only rendered at all
  when the conversation is actually unread (nothing to swipe for
  otherwise). `app/(tabs)/messages.tsx` handles it optimistically —
  updates local state immediately, fires `markConversationRead` best-effort
  (`.catch(() => {})`, matching `messages/[id].tsx`'s own established
  convention for this same call) — worst case a failed request just means
  the row reverts to unread on the next 20s poll.
- `Button` and `ListRow` (the shared row shell behind every list surface
  in the app — feed, notifications, search results, conversations, and
  more) both moved their press feedback from Pressable's own
  `style={({pressed}) => ...}` callback to a Reanimated shared-value pair
  (scale + opacity), gaining a small `withSpring` scale dip alongside the
  opacity every pressable already had. **Card was dropped from this
  item's original scope**: as implemented, `Card` is a plain non-
  interactive `View` wrapper — nothing calls it with an `onPress` today,
  so there was no press state to animate. `ListRow` reaches far more
  surface area than `Card` would have anyway, being the shared shell
  behind essentially every tappable row in the app. One shared spring
  tuning (`theme.motion.press` — damping/stiffness, not a duration, since
  `withSpring` is physics-driven unlike `motion.fast/base/slow`) keeps
  Button's and ListRow's press feel from drifting apart if retuned later.
  Note for future components: `AnimatedPressable` (Reanimated's wrapped
  `Pressable`) intercepts the resolved `style` prop directly, so it never
  sees inside a `style={(state) => ...}` function — any animated press
  state has to be driven from `onPressIn`/`onPressOut` shared values
  instead, not Pressable's own callback form.
- **Jest infra needed two fixes neither library documents for this
  version combination**, both in the new `mobile/jest.setup.js`
  (registered via `package.json`'s new `jest.setupFiles`): (1)
  `react-native-reanimated`'s own official mock
  (`react-native-reanimated/mock`) is broken for 4.5.1 — its `mock.ts`
  re-imports a few utilities via a relative `./index`, which resolves to
  a different absolute path than the `"react-native-reanimated"`
  specifier Jest's `jest.mock` intercepts, so that internal import
  bypasses the mock and hits the real native module loader anyway. Worked
  around with a minimal hand-written mock scoped to exactly what this
  codebase's components use (`useSharedValue`, `useAnimatedStyle`,
  `useReducedMotion`, `useEvent` — needed transitively by
  `GestureDetector`, not called directly — `withSpring`, `withTiming`,
  `runOnJS`), rather than depend on the upstream mock's fragile internal
  path assumption. (2) `react-native-gesture-handler/jestSetup` (its own,
  working-as-documented official setup) also needed registering. Both
  libraries additionally needed adding to `package.json`'s
  `transformIgnorePatterns` (they ship untranspiled source, like every
  other RN-ecosystem package already carved out there). Separately, the
  very first full-suite run after any of these config files changed
  reliably timed out one test at ~5s (cold Jest transform cache — same
  pattern M8 saw once with `LockScreen`, confirmed by 3 consecutive clean
  reruns once the cache warmed); since CI always starts fully cold, bumped
  `testTimeout` to 15000 globally rather than ship a job that flakes on
  every run — verified against a `jest --clearCache` run (11.2s, cleanly
  under the new timeout).
- Verification: `npx tsc --noEmit` clean, `npm test` — 51/51 passing
  (including a `--clearCache` cold run matching CI's conditions), `npm
  audit` — 0 vulnerabilities, `npx expo export --platform web` bundles
  successfully (module count 1515 → 1980, bundle 3.1MB → 4.2MB from the
  two new dependencies, as expected).

#### M9 addendum — Profile screen world-class pass (built)

Requested as an explicit follow-up to M9 rather than a separate numbered
sub-phase. Split into a data-parity half (closing a real mobile/web gap,
not inventing anything) and a visual/interaction half (the "pro" pass
proper).

- **Data parity**: `GET /api/v1/profiles/[username]` was missing two
  fields the web profile page (`[username]/page.tsx`) has always shown —
  `followingCount` (a real denormalized `Profile.followingCount` column,
  simply never selected into this route's response) and `isPremium`
  (reusing `isProfilePremium()` from `lib/platform-billing.ts`, the exact
  helper the web page itself calls — not re-derived). Added to the route,
  the mobile `Profile` type, and a new `PremiumBadge` component mirroring
  `VerifiedBadge`'s shape exactly (same accent color, differentiated only
  by icon — a Sparkle, matching web's own badge — rather than a new gold/
  yellow tone, since this app's palette reserves Yellow for status only,
  never decorative, per `theme.ts`'s own Google-4-color comment).
  **Deliberately not added**: web's third stat, link count, and its
  followers/following list pages — mobile has no "links in bio" feature
  and no followers/following list screens to navigate a tap into, so
  adding the numbers without a destination would be the same kind of
  half-built affordance M9's `ConversationRow` archive-action scope cut
  avoided. The two stats mobile *can* show (followers, following) render
  as plain text, not links.
- **Full-screen avatar/cover viewer**: new `src/components/
  ImageLightbox.tsx` — a full-screen `Modal` (built-in `fade` transition,
  not a bespoke Reanimated one; unlike `BottomSheet` this isn't opened
  often enough per session to earn that investment), tap-to-dismiss.
  Wired to both the avatar and cover `Pressable`s in
  `ProfileScreenBody.tsx`.
- **Cover overscroll stretch**: `ProfileScreenBody`'s post list became
  `Animated.FlatList`, with `useAnimatedScrollHandler` driving a
  `translateY`+`scale` transform (not a height change, so the FlatList
  header never reflows mid-scroll) on the cover image — pulling down
  stretches it, the classic X/Instagram profile-cover rubber-band effect.
  Clipped to the cover's own bounds via a wrapping `overflow: hidden`
  view.
- **Header icons moved onto the cover**: previously rendered as a plain
  row *below* the cover (not overlaid — an easy detail to miss reading
  the old layout casually), matching neither X nor Instagram's own
  pattern. Now absolutely positioned over the cover's top-right corner,
  each icon in a circular `rgba(0,0,0,0.6)` scrim (the same treatment
  `edit-profile.tsx`'s own cover-edit badge already established) with a
  fixed white icon color — legible against a cover photo of any
  brightness, unlike the old `theme.colors.foreground` choice, which only
  ever worked against the previous plain-background placement.
  `PremiumBadge` renders next to `VerifiedBadge` in the name row.
- **Follow/Edit-profile buttons switched to the shared `Button`
  component** (`src/components/Button.tsx`) instead of their own
  hand-rolled `Pressable` — `Button`'s own header comment already named
  this exact pill shape as the pattern it was modeled on, so this closes
  that loop and gets M9's press-scale-spring for free rather than a third
  copy of that animation.
- **Root `npm run lint` regression caught and fixed** — the first time
  this addendum's mobile work was actually checked against root's
  `eslint.config.mjs` (M8/M9's own verification only ever ran mobile's own
  `tsc`/`jest`, not root lint, which `ci.yml` runs unconditionally on
  every push/PR and would have failed on this). `core-web-vitals`'
  React-Compiler-oriented `react-hooks/immutability` rule flags every
  `sharedValue.value = x` (Button/ListRow/BottomSheet's press and gesture
  handling, this pass's own scroll handler) as "modifying a value returned
  from a hook" — but that assignment is Reanimated's documented API for
  driving UI-thread animations, not a mistake, and has no alternative form
  to rewrite it into. Added a `files: ["mobile/**/*.{ts,tsx}"]` override
  in `eslint.config.mjs` disabling just that one rule for `mobile/` (any
  future Reanimated usage anywhere in that app hits the same rule/library
  incompatibility, not only today's four call sites) — every other rule
  stays active there. Separately fixed two `no-require-imports` errors in
  this addendum's own new files (`jest.setup.js`'s top-level gesture-
  handler setup moved to a real `import`; `wallet.test.tsx`'s
  `require("react").useEffect` inside its `expo-router` mock replaced with
  a `mock`-prefixed import alias — `babel-plugin-jest-hoist` exempts
  `mock`-prefixed identifiers from the "no outer-scope reference inside
  jest.mock()" restriction that made the `require()` necessary in the
  first place).
- Verification: `npx tsc --noEmit` clean (mobile and root), `npm test` —
  mobile 51/51 still passing (no existing test renders this screen, so
  none needed updating; `wallet.test.tsx`'s mocked `Profile` object stays
  valid via its existing `as unknown as Profile` cast); root `npm test` —
  43/44 passing, the one failure (`auth.test.ts`'s login rate-limit test,
  unrelated to anything touched here) confirmed pre-existing flakiness by
  passing cleanly in isolation, not a regression from this change. Root
  `npm run lint` — 0 errors from any file this pass touched (9 remaining
  errors are the same pre-existing findings M7 already documented:
  `Skeleton.tsx`, `OfflineBanner.tsx`, `expoNotificationsModule.ts`,
  `post/[id].tsx`). `npx expo export --platform web` bundles successfully.
  No dedicated manual verification beyond that — same posture §5's own
  verification section already states for this whole addendum ("native-app
  behavior isn't browser-testable here"); this wasn't Expo Go/simulator-
  verified in this pass.

### M10 — Realtime unlock, then what it was blocking (built)

- **`GET /api/v1/messages/stream`**, a bearer-token counterpart to the
  existing cookie-session `api/messages/stream/route.ts` — same
  `resolveApiRequest`/`requireScope("messages:read")`/
  `checkApiRateLimit` auth middleware every other v1 route uses, checked
  once at connection-open (long-lived connection, not repeated per
  heartbeat). The real unlock: it subscribes to the **exact same**
  in-memory event bus (`src/lib/message-events.ts`'s `subscribeToUser`/
  `publishToUsers`), which was already keyed by `userId` with no notion of
  *how* a subscriber authenticated — so nothing on the publish side
  (`recordMessageAndNotify`, `messaging.ts`) needed to change. Genuinely
  "shared infra, built once," not just stated as an intent. Same 20s
  heartbeat and presence side effects (`markUserOnline`/
  `markUserOffline`, `lastActiveAt`) as the cookie route, so a mobile
  session with an open stream shows as "online" to conversation partners
  exactly like an open web tab does.
- **Mobile side**: installed `react-native-sse` (zero dependencies,
  Expo-compatible) — RN has no built-in `EventSource` with custom-header
  support, and a bearer token has to travel as a header, not a cookie.
  `src/realtime/messagesStream.ts` wraps connection creation/event
  parsing; `src/realtime/MessagesStreamContext.tsx` holds **one**
  connection for the whole signed-in session (mirrors the web app's own
  `MessagingProvider` — one tab connection, many consumers) rather than
  each screen opening its own on every focus. Mounted once in
  `app/_layout.tsx` inside `AuthProvider`. Reconnects automatically
  whenever the access token rotates (`pkceAuth`'s refresh flow) — an
  `EventSource` can't swap its own Authorization header mid-connection.
- `app/messages/[id].tsx` **and** `app/(tabs)/messages.tsx` both dropped
  their polls (5s and 20s respectively — the inbox screen's poll wasn't
  explicitly named in this section's original plan, but is the same
  poll-replaced-by-stream case, so upgraded alongside it rather than left
  half-migrated) in favor of `useMessagesStreamEvents`, filtering to
  `new-message`/`conversation-updated` events (the thread screen further
  filters to its own `conversationId`, so unrelated conversation activity
  elsewhere doesn't trigger a refetch there). No new scope — `messages:read`
  already covers it, exactly as planned.
- Community chat is the next feature this unlocks, not built in this pass.
  Voice rooms stay deferred past M10 — media transport is a materially
  bigger scope than text delivery, not a natural extension of the same
  infra.
- **Testing note**: `MessagesStreamContext`'s test suite
  (`src/realtime/__tests__/MessagesStreamContext.test.tsx`) is smaller
  than originally attempted — a third-or-later `renderHook(...,
  {wrapper: MessagesStreamProvider})` call anywhere in that file,
  regardless of what it exercises or what order it runs in, reliably made
  that render's `connectMessagesStream` call silently not fire. Confirmed
  by isolating each candidate scenario (multi-subscriber fan-out, the
  latest-callback-ref behavior, token-rotation reconnect) individually —
  each passes alone, and each breaks whichever test runs third regardless
  of content. This is a limitation of the installed
  `@testing-library/react-native` version's async test renderer under
  repeated same-file mount/unmount cycles (Jest isolates test *files*
  from each other, not repeated renders within one file), not a bug in
  `MessagesStreamContext` — kept the two tests that reliably cover the
  connect-when-signed-in and stop-delivering-after-unmount paths every
  other scenario also depends on, rather than ship a suite that fails
  based on incidental ordering.
- Verification: `npx tsc --noEmit` clean (mobile and root), `npm test` —
  mobile 53/53 passing (up from 51 — the two new
  `MessagesStreamContext` tests), confirmed stable across 3 consecutive
  full-suite runs; root `npm test` — 44/44 passing (the M9-pass
  `auth.test.ts` flake didn't recur). Root `npm run lint` — 0 errors from
  any file this pass touched (same 8 pre-existing errors as M9's pass).
  `npx expo export --platform web` bundles successfully. No dedicated
  manual/simulator verification, same posture as every other sub-phase's
  own stated limitation here.

### M11 — In-app-purchase compliance (engineering half only)

**Correction (discovered while starting to build this): the schema half
below was already built**, in `331cfa1` ("Build Phase 15 mobile app:
PKCE-authenticated Expo client + fixes") — a commit that predates this
addendum document entirely. Whoever originally drafted this M11 section
didn't check `prisma/schema.prisma` first, and neither did the session
that carried the plan forward into §6 above; both wrote "safe to build
now" for something already sitting in the codebase. Actually in place
today, verified by reading it rather than assumed:

1. `PaymentTransaction.processor` (`stripe_connect | apple_iap |
   google_play_billing`) and `.storeFee`, both threaded through
   `recordPaymentTransaction` (`src/lib/payments.ts`) — every pre-phase-15
   call site defaults to `stripe_connect`/`null` and is unaffected;
   `platformFee` and `storeFee` are computed and stored as separate
   fields, never conflated into one number.
2. An `IapPayoutBatch` model plus `recordIapPayoutBatch`/
   `reconcileIapPayoutBatch` (same file) — the latter attributes every
   succeeded, not-yet-reconciled transaction for a processor within a
   batch's period to that batch and marks it `reconciled`, the
   "before disbursement" step phase-15 §6.4's acceptance criterion names.
3. **Was genuinely, correctly incomplete beyond that, now closed**:
   confirmed by `grep` (not assumed) that no route or admin action
   anywhere called `recordIapPayoutBatch`/`reconcileIapPayoutBatch` —
   they were reachable library functions with zero callers, reachable
   only from a Prisma console. Built the missing admin trigger surface:
   `src/app/actions/iap-payouts.ts` (`createIapPayoutBatchAction`,
   `reconcileIapPayoutBatchAction`, both gated on `requirePlatformAdmin`)
   and `src/app/admin/payments/iap-batches/page.tsx` — a new
   `/admin/payments/` area, kept separate from `/admin/wallet/` since
   that's the internal coin economy (`CoinTopUpRequest`/
   `CoinPayoutRequest`), a different domain from `PaymentTransaction`/
   Stripe Connect real money. Lists batches with attributed transaction
   counts and platform-fee/store-fee totals (summed client-side from the
   batch's own `transactions` relation — batch volumes are low enough
   that a nested `include` beats an aggregate query per batch), a form to
   record a new batch, and a "Reconcile" button shown only while a batch
   is still `received`. **Deliberately still no "mark disbursed"
   action** — nothing on this page moves real money to a creator, and a
   fake status flip with no transfer behind it would be a false record,
   not a shortcut; disbursement itself stays out of scope for the reason
   below.
4. **No native purchase flow gets wired for any category** until legal
   confirms which categories current store policy actually covers, in
   which jurisdictions — phase-15 §6.1's point that DMA/Epic-v-Apple
   rulings make this jurisdiction-dependent and evolving, not a fixed
   rule to hardcode once. Still true, still not built, still correctly
   gated on non-engineering sign-off this addendum can't provide.

Until sign-off lands, marketplace/business/event purchases keep today's
browser hand-off (M5/M6's existing posture) — the safe default, not a
placeholder. What's left of M11 is exactly what was always flagged as
out of scope for engineering alone: the native purchase flow itself
(legal-gated) and actually disbursing IAP-attributed earnings through
`CreatorPayoutAccount` (phase-15 §6.3's dedicated finance/ops effort) —
neither is a task this addendum can pick up unilaterally.

Verification (admin trigger surface): `npx tsc --noEmit` clean, `npm run
lint` — 0 errors from either new file (same 8 pre-existing errors as
M8-M10), `npm test` — 44/44 passing. Manually confirmed
`/admin/payments/iap-batches` compiles and correctly 307-redirects an
unauthenticated request to `/login` (the `requirePlatformAdmin` chain
firing) against the project's own already-running dev server — didn't go
further than that (submitting the form, seeing the rendered admin view)
since this repo's `DATABASE_URL` points at `prisma/prod.db`, and
fabricating an admin session to click through felt like the wrong call
against a database named that without checking with the user first.

### M12 — Mobile settings/account parity (built)

Requested as a follow-up review found web's settings surface
(`/s/[username]/*`, 12 groups, ~40 pages, per `addendum-account-settings-
hardening.md`) had no mobile equivalent beyond Edit profile/Notification
preferences/Connected apps — not just missing screens, but a missing
bearer-token API layer: every web feature here lived only in cookie-session
server actions a native client can't call.

- **Security fix, done first**: `resolveApiRequest` (`src/lib/api-auth.ts`)
  validated the bearer token and OAuth authorization/app status but never
  checked `User.status` — unlike `getCurrentUser()` (web sessions), which
  force-logs-out any non-`"active"` user on every read. A deactivated/
  deleted account's existing mobile bearer tokens would have kept working
  until natural expiry. Now checked on every `/api/v1/*` request, not just
  the new routes this addendum adds.
- **6 new OAuth scopes** (`src/lib/oauth.ts`'s `OAUTH_SCOPES`):
  `privacy:read`/`write`, `account:read`/`write`, `preferences:read`/`write`
  — added to mobile's `pkceAuth.ts` `SCOPES` array. `first-party-apps.ts`'s
  `ensureFirstPartyApps()` already loops over every `OAUTH_SCOPES` entry and
  auto-approves it per first-party app, so no change was needed there.
- **18 new `/api/v1/*` routes**: `privacy` (GET/PATCH), `blocks` (GET/POST)
  + `blocks/[id]` (DELETE), `account/sessions` (GET, folds in login history)
  + `account/sessions/[id]` (DELETE) + `account/sessions/revoke-others`
  (POST), `account/password`, `account/contact/email` +
  `account/contact/phone` + `account/contact/phone/confirm`,
  `account/two-factor` (GET) + `.../enroll` + `.../confirm` + `.../disable`
  + `.../recovery-codes`, `account/lifecycle/deactivate` + `.../delete`
  (the delete route re-exports deactivate's handler — same state transition
  as web's own `scheduleDeactivation`), `account/export`, `preferences`
  (GET/PATCH). `users/me`'s existing PATCH gained optional
  `isPrivate`/`themePreset` fields (previously deliberately omitted; M12
  closes that gap the same way M9's profile pass closed
  `followingCount`/`isPremium` on the read side).
- **Reused, not re-derived**: every route calls into the same `lib/`
  primitives the web actions use (`lib/two-factor.ts`, `lib/preferences.ts`,
  `lib/uploads.ts`, etc.) rather than reimplementing logic. Two web actions
  were refactored to extract a plain, identity-agnostic core so both the
  cookie-bound action and the new bearer-token route share one
  implementation instead of two: `block.ts`'s `blockUser`/`unblockUser` now
  wrap `blockUserById`/`unblockUserById`. `ALLOW_DMS_FROM_VALUES`
  (`actions/profile.ts`) and `FONT_SCALES`/`AccessibilityPrefs`
  (`actions/preferences.ts`) moved into `lib/privacy.ts`/`lib/preferences.ts`
  respectively — a `"use server"` file may only export async functions, so
  a plain `Set`/type living there was a production-build break
  (`next build` catches this at page-data-collection time), not just a lint
  nit.
- **No reactivation endpoint, no login-time 2FA challenge on mobile** —
  deliberately not built. Mobile sign-in opens `/oauth/authorize`, a real
  0dot web page, in an in-app browser; if that flow redirects through
  `/login` for a `deactivated` or `twoFactorEnabledAt` account, the existing
  web pages already handle it, rendered in-browser. Only the in-app
  *management* screens (enroll/disable 2FA, view sessions) needed building.
- **8 new mobile screens** (`app/privacy-settings.tsx`, `blocked-users.tsx`,
  `change-password.tsx`, `two-factor.tsx`, `sessions.tsx`,
  `contact-settings.tsx`, `account-management.tsx`, `preferences.tsx`) plus
  a "Block" entry point added to `ProfileScreenBody.tsx`'s header (only for
  another user's profile) — a blocked-users *list* with no way to add to it
  would have been half a feature. `settings.tsx` restructured from one flat
  4-row list into grouped sections (Profile/Security/Notifications/
  Preferences/Account/Developer) mirroring `settingsNavGroups()`'s own IA.
  New `src/components/PasswordInput.tsx` (no native password field existed
  anywhere before — sign-in itself is PKCE/web).
- **Theme system gained a real provider**: `theme.ts`'s `useTheme()` was
  fully static (light/dark from `useColorScheme()`, nothing else). New
  `src/themePreferences.tsx` (`ThemePreferencesProvider`, mounted in
  `app/_layout.tsx` alongside `AuthProvider`/`MessagesStreamProvider`)
  fetches `/api/v1/preferences`, caches in `AsyncStorage` for instant
  boot-time application, and `useTheme()` now derives a font-scale/
  high-contrast variant from it — mirroring `globals.css`'s own
  `[data-font-scale]`/`[data-high-contrast]` rules exactly (112.5%/125% text
  scale steps, identical per-scheme override colors). Every existing
  `useTheme()` call site keeps working unchanged.
- **Deliberately no in-app "reduce motion" toggle**: this app already reads
  the OS-level signal everywhere (`animateLayout.ts`'s own
  `AccessibilityInfo` check, `Button`/`BottomSheet`'s Reanimated
  `useReducedMotion()`) — a second control would just fight it. Instead,
  `preferences.tsx` omits the toggle, but `animateLayout.ts` gained a
  `setWebReduceMotionPreference()` setter that `ThemePreferencesProvider`
  calls whenever the web-set `accessibilityPrefsJson.reducedMotion` value
  changes, OR'd into the existing OS check — turning it on from web reduces
  motion on mobile too, without a redundant switch. (Reanimated's own
  `useReducedMotion()` call sites were left as-is — extending those to also
  read this preference would mean replacing a library hook everywhere it's
  used, a materially bigger change than this settings-parity pass scoped
  for.)
- Two mobile-only parallel data files were added rather than importing
  across the web/mobile boundary (different bundler/runtime, no shared
  `@/lib/*` resolution): `src/utils/countryCodes.ts` (mirrors
  `lib/country-codes.ts`) and `src/utils/themePresets.ts` (mirrors
  `lib/theme-presets.ts`'s `THEME_PRESETS`, picker-relevant fields only) —
  same "kept separately here" posture `notification-preferences.tsx`'s own
  `LABELS` constant already documents for an equivalent case.
- New dependencies: `expo-sharing`, `expo-file-system` (account data export
  — save-to-file then hand off to the OS share sheet, since a browser-style
  download doesn't exist natively).
- **Testing note**: `theme.ts` importing `themePreferences.tsx` (new) pulled
  `@react-native-async-storage/async-storage` into every test's import graph
  that touches `useTheme()` — previously nothing reachable from any test
  exercised that package (`onboarding.ts`'s own usage had no coverage), so
  no mock existed. Added the package's official Jest mock to
  `jest.setup.js`, referenced via a `mock`-prefixed `import` rather than
  `require()` (same `babel-plugin-jest-hoist` exemption `wallet.test.tsx`'s
  own comment documents) to keep root lint's `no-require-imports` clean.
- Verification: `npx tsc --noEmit` clean (mobile and root), root `npm run
  lint` — 0 new errors/warnings from any file this pass touched (same 11
  pre-existing errors/17 warnings as M8-M11's own baseline), `npm test` —
  mobile 55/55 passing, root 44/44 passing. Root `npx next build` — clean
  production build, all 18 new `/api/v1/*` routes present in the route
  manifest (this also caught the `"use server"`-export build break above,
  which `tsc`/`lint`/tests alone did not). `npx expo export --platform web`
  bundles successfully. No dedicated manual/simulator verification, same
  stated limitation as every other sub-phase here.

### M13 — Bug fixes + closing a stale search deferral + pro-level polish (built)

Requested as a live audit of the shipped app (all 5 tabs + key flows,
compared screen-by-screen against the web platform) that found 5 concrete
bugs and several places the app fell short of a "world-class pro" bar.
Scoped to close those plus a handful of new functions that either fix a
documented, now-stale deferral or add standard-for-the-category polish —
deliberately not a bolt-on of the out-of-scope items §1/§4 already name
(native purchase/create flows, the full web creator-portfolio surface).

**5 bugs, all fixed:**

1. **Reply icon was a bare `View`, not tappable** (`PostRow.tsx`). Fixed
   as a real feature, not just a dead-`onPress` patch: new
   `src/components/ReplySheet.tsx` (`BottomSheet` + inline composer,
   reusing `createPost({ replyToId })`, already supported server-side)
   opens from the reply icon on every screen that renders `PostRow`
   (feed, explore, bookmarks, community, profile). `post/[id].tsx`
   already had its own persistent reply composer bar at the bottom — its
   reply icon focuses that (`TextInput` ref) instead of opening a second
   composer.
2. **Compose discarded drafts with zero confirmation.** `onCancel` now
   checks `body.trim().length > 0 || images.length > 0` (the same
   expression `canPost` already used) before showing an `Alert.alert`
   discard confirmation — empty drafts still discard silently.
3. **Edit Profile had the same silent-discard bug**, higher stakes (bio,
   name, avatar, cover, theme, privacy toggle). Same `Alert.alert` pattern,
   gated on a real diff (see #4).
4. **Edit Profile's Save button wasn't dirty-gated** — enabled the
   instant the screen loaded. Both #3 and #4 share one fix: a snapshot of
   what `getMe()` actually returned, captured once into **state** (not a
   `useRef` — `react-hooks/refs` flags reading `ref.current` during
   render, and `isDirty` needs to be computed during render; a ref is for
   values render doesn't need, this one is read there). `canSave` becomes
   `isDirty && <existing validity checks>`; Cancel diffs current field
   state against the snapshot (plus `newAvatar`/`newCover` non-null) to
   decide whether to confirm.
5. **Followers/following unreachable** — the profile stat pills were
   plain `View`s with no destination, and no route/API existed at all.
   Built as a real feature: two new bearer-token routes,
   `GET /api/v1/profiles/[username]/followers` and `.../following`
   (`src/app/api/v1/profiles/[username]/{followers,following}/route.ts`),
   modeled directly on `bookmarks/route.ts`'s composite-PK
   `(createdAt, id)` cursor pagination and mirroring
   `[username]/followers|following/page.tsx`'s exact query + private-
   account gate (owner or an `accepted` `Follow` row, else a 404 — same
   posture private content already 404s elsewhere in `/api/v1` rather
   than the web page's inline message) — `profile:read` already covers
   this, no new scope. Rows lacking a claimed `Username` (optional on
   `User`) are excluded rather than surfaced with a null handle, since
   there'd be no profile URL for `UserRow` to navigate to. Mobile: one
   shared `src/screens/FollowListScreen.tsx` (`{username, mode}`, same
   "one implementation, not two near-identical screens" posture
   `ProfileScreenBody` already established) behind two thin routes,
   `app/[username]/followers.tsx` / `.../following.tsx` — coexisting on
   disk with the existing `app/[username].tsx` file exactly the way
   `(tabs)/messages.tsx` (`/messages`) and `messages/[id].tsx`
   (`/messages/:id`) already coexist across the `(tabs)` group boundary;
   confirmed no routing conflict via a clean `npx expo export --platform
   web`. `ProfileScreenBody.tsx`'s stat pills became `Pressable`s;
   `resolvePath.ts` gained two-segment `/username/followers` and
   `/username/following` branches, ordered **before** the single-segment
   username catch-all (which only matches one path segment) so a
   universal link or notification into either opens natively.

**New pro-level functions:**

- **Widened Explore search, 2 tabs → 6.** `GET /api/v1/search`'s own
  comment said communities/businesses/events/marketplace were left out
  because mobile had no screen to navigate a result into — no longer
  true since M4-M6. `searchCommunities`/`rankCommunities`,
  `searchBusinesses`/`rankBusinesses`, and `searchEvents`/`rankEvents`
  were **extracted from `search/page.tsx` into a new `src/lib/search.ts`**
  (the page now imports them) so the v1 route calls the exact same
  query+rank logic the web page does, not a second copy — same "shared
  infra, built once" posture M3's `recordMessageAndNotify` and M12's
  `blockUserById`/`unblockUserById` extractions already established.
  Marketplace reuses `fetchAllMarketplaceCategories` directly (already
  exported, already what `GET /api/v1/marketplace` wraps). Each new type
  gated behind its already-granted scope
  (`communities:read`/`businesses:read`/`events:read`/`marketplace:read`,
  all provisioned since M4-M6 — no new scopes). Events search returns a
  lighter row (`{slug, title, startsAt}`, new `EventSearchResult` type)
  than the full events list screen's `EventSummary` — `searchEvents`'s
  own query never joined the host relation web's own search page doesn't
  either, and adding one here would mean this route diverging from what
  it's supposed to mirror; tapping a result still opens the real event
  detail screen, which shows the rest. `(tabs)/explore.tsx`'s
  `SegmentedControl` grows to 6 segments, each with its own state and a
  `ListRow`-based result row matching each domain's own list-screen row
  shape (communities.tsx/businesses.tsx/events.tsx render these inline,
  not as an extracted component, so the same shape is repeated here
  rather than imported).
- **Tab-bar unread badges (Messages + Notifications).** Zero badge
  support existed before this. The counts already existed server-side —
  `getUnreadConversationCount` (`lib/messaging.ts`) and
  `getUnreadNotificationCount` (`lib/notifications.ts`) already power the
  web tab-favicon badge (`api/browser-tab/unread-count/route.ts`), just
  summed there instead of split. New `GET /api/v1/unread-counts`
  (`{messages, notifications}`, both scopes checked since it spans both
  domains) calls the same two functions, split. `GET /api/v1/notifications`
  and `GET /api/v1/conversations` also each gained an `unreadCount` field
  on their existing paginated response (one extra cheap query each,
  reusing the same two functions) for screens that already fetch that
  list to use directly. Mobile: new `UnreadBadgeContext`
  (`src/realtime/UnreadBadgeContext.tsx`), mounted once in `_layout.tsx`
  inside `MessagesStreamProvider`, refetches on sign-in, on app
  foreground (`AppState`), and — the nice discovery mid-build — on
  **every** stream event, not just message ones: `message-events.ts`'s
  bus already carries a bare `{type: "notification"}` event alongside
  `new-message`/`conversation-updated` (every `notify*` helper in
  `notifications.ts` already publishes to it), so both counts stay live
  off the one connection `MessagesStreamContext` already holds open, with
  no new stream and no polling loop for notifications. `messages.tsx`,
  `messages/[id].tsx`, and `notifications.tsx` also call the context's
  `refetch()` right after their own mark-read actions, so a badge clears
  the instant a screen actually reads the thing it's counting rather than
  waiting for the next stream event. `(tabs)/_layout.tsx` renders a small
  `theme.colors.danger` count bubble (capped "9+") absolutely positioned
  over each icon — Ionicons has no badge slot of its own.
- **"New posts" pill on the Home feed.** Previously silent — no signal
  beyond a manual pull-to-refresh that newer posts exist. A 30s interval
  while the tab is focused calls `getFeed()` (no cursor, same call
  pull-to-refresh already makes) and compares the newest returned post's
  `id` against the currently-loaded newest; on a mismatch, a small pill
  appears above the list rather than silently inserting anything. Tapping
  it scrolls the `FlatList` to offset 0 and re-runs `loadFirstPage()`
  (dismissing the pill as a side effect of that call resetting the
  tracked newest-id). No new API route.
- **Long-press quick actions on posts.** No `onLongPress` existed
  anywhere in the app before this — `ListRow` (the shared row shell
  behind essentially every tappable row) gained an optional `onLongPress`
  prop, `PostRow` threads it through. Opens a new
  `src/components/PostActionsSheet.tsx` (`BottomSheet`): **Share**
  (mirrors `post/[id].tsx`'s existing header Share button),
  **Copy link** (new `expo-clipboard` dependency — nothing in the app
  needed clipboard access before), and — **own posts only** — **Delete**.
  No Report action: unlike Delete, no `reportPost`/`reportContent` action
  exists anywhere on web to mirror, and wiring a button to a mutation
  with nothing to call would be exactly the half-built affordance M9's
  `ConversationRow` archive-action scope cut already rejected once.
  Delete needed a real gap closed first — no bearer-token delete route
  existed at all (`GET /api/v1/posts/[id]` was read-only): added `DELETE`
  to that same route file, mirroring `actions/posts.ts`'s `deletePost`
  exactly (author-only lookup, reuses the already-shared
  `softDeletePostAndDecrementCounts` from `lib/post-moderation.ts` —
  `posts:write`, already granted, no new scope). `post/[id].tsx`'s header
  Share button became a "Post options" (`ellipsis-horizontal`) button
  opening the same sheet, so Delete/Copy link are reachable from the
  detail screen too, not just long-press; deleting there calls
  `router.back()` since there's nothing left to render.

**Testing note**: `app/__tests__/edit-profile.test.tsx` gained a second
describe block (3 new tests) covering the dirty-gate/discard-confirm fix
(#4/#3 above) — Save disabled until a real field change, Cancel-with-no-
changes skipping the confirm entirely, Cancel-with-changes showing it and
only calling `router.back()` once "Discard" is actually pressed. Compose's
analogous (simpler) discard logic stayed untested by choice, same
"cosmetic/lower-risk screens don't all need coverage" posture M8 already
took, rather than duplicating an already-demonstrated pattern for
marginal additional confidence.

Verification: `npx tsc --noEmit` clean (mobile and root), root `npm run
lint` — 0 errors from any file this pass touched (same pre-existing
baseline every prior sub-phase already carried forward; one real finding
during this pass — `react-hooks/refs` on the initial `useRef`-based
dirty-gate snapshot — fixed by switching that snapshot to `useState`, not
suppressed), `npm test` — mobile 58/58 passing (55 + 3 new), root 44/44
passing. Root `npx next build` — clean production build, all new
`/api/v1/*` routes (`profiles/[username]/followers`, `.../following`,
`unread-counts`) present in the route manifest, widened `search` and the
new posts `DELETE` handler included. `npx expo export --platform web`
bundles successfully — also the practical confirmation that
`app/[username].tsx` coexisting with the new `app/[username]/` directory
routes correctly. Manual verification on the already-running
Pixel_8_API_35 emulator, rebuilt for the new `expo-clipboard` native
dependency (same "new native module needs a real rebuild, not just
`expo start`" M12 lesson) and pointed at the local dev server
(`http://10.0.2.2:3001`, the same `prisma/prod.db` the deployed app uses,
so the existing session kept working without re-authenticating) — see
below.

### M14 — Live-testing fallout: 2 real bugs + presence + voice/file attachments (built)

M13's own manual-verification pass (§5 above) found the app's *shape* worked
but didn't exercise every write path against a live account. Once the user
actually used the rebuilt app against production data, two real bugs
surfaced immediately, plus two feature requests that came out of using it —
all four handled in the same session, live-verified via Fast Refresh against
the local dev server rather than only inferred from a rebuild-and-guess
cycle.

**Bug: profile picture/cover upload silently failed.** Reproduced live:
`updateProfile`'s multipart path threw `Error: Unsupported FormDataPart
implementation` from `expo/src/winter/fetch/convertFormData.ts` — Expo
SDK 57's fetch layer, whose own source comment states outright "`uri` is
not supported for React Native's FormData," rejects the long-standing
`form.append(field, {uri, name, type})` convention `appendImage`
(`api/client.ts`) used. That converter only accepts a real `Blob` or
anything exposing `.bytes()` — `expo-file-system`'s `File` class does both
(`.name`/`.type` too, which the multipart header logic also reads straight
off the appended value). Fix: `appendImage` now does `new File(image.uri)`
and appends that instead of the raw object — same call sites (avatar/cover
upload, post images) get the fix for free, no per-caller change needed.
Verified live: text-only saves worked throughout (isolating the bug to the
multipart path specifically), then avatar upload succeeded end-to-end after
the fix, confirmed by the profile screen showing the newly uploaded image
after `router.back()`.

**Bug: message/reply/compose text fields covered by the keyboard on
Android.** All 6 `KeyboardAvoidingView` usages in the app
(`compose.tsx`, `edit-profile.tsx`, `post/[id].tsx`,
`community/[slug].tsx`, `messages/[id].tsx`, `messages/new.tsx`) shared
`behavior={Platform.OS === "ios" ? "padding" : undefined}` — `undefined`
means the component does nothing at all on Android, leaving the OS's own
`windowSoftInputMode="adjustResize"` (AndroidManifest.xml) as the only
mechanism, which is increasingly unreliable under RN's newer edge-to-edge
display handling. Fixed all 6 to `behavior={Platform.OS === "ios" ?
"padding" : "height"}` — a one-line, identical change repeated across every
occurrence rather than a new abstraction for six call sites. Not visually
confirmable on this emulator (it uses hardware-keyboard passthrough, so no
on-screen keyboard ever renders to be covered by) — the fix is the
documented, standard correction for this exact "no Android behavior +
unreliable adjustResize" symptom, not a guess.

**Feature: active/last-seen presence.** The web app already has this in
full (`lib/presence.ts`'s in-memory `isUserOnline`, `PresenceStatus.tsx`'s
"Active now" / "Active Xm ago" line) and `message-events.ts`'s SSE bus
already carries a `{type: "presence", userId, online}` event mobile's
stream client already typed but never consumed. `GET /api/v1/conversations`
gained `isOnline`/`otherLastActiveAt` per item (reusing `isUserOnline` +
`getConversationDisplayInfo`'s existing `otherLastActiveAt` — both already
computed for the web page, just not surfaced here before). Mobile:
`ConversationRow` gets a small green (`theme.colors.success`, a status
color per `theme.ts`'s own convention) dot on the avatar when online;
`(tabs)/messages.tsx` passes `otherUserId`/`isOnline`/`otherLastActiveAt`
as route params (same pattern `title`/`avatarUrl` already used) to
`messages/[id].tsx`, which seeds local state from them and then updates
live off the *already-open* `MessagesStreamContext` connection on a
matching `"presence"` event — no new connection, no polling. New
`src/utils/presence.ts`'s `formatLastActive` mirrors web's
`PresenceStatus.tsx` copy exactly ("Active just now" / "Active Xm ago" /
etc.) so the phrasing doesn't diverge between clients.

**Feature: voice notes + file attachments in DMs.** Mobile's
`POST /api/v1/conversations/[id]/messages` was text-only by explicit
original scope note ("no attachment upload"). Backend:
`resolveMessageAttachment` — previously private to
`actions/messages.ts`, a `"use server"` file a route handler can't import
— moved to `lib/messaging.ts` and exported (same boundary reasoning
`ResolvedAttachment`'s own comment already stated for the type; `messages.ts`
now imports the moved function instead of keeping a duplicate). The route
gained the same dual JSON/multipart shape `PATCH /api/v1/users/me` and
`POST /api/v1/posts` already use, mirroring `sendMessage`'s exact
validation including spec §5.1's "body is nullable if attachment-only"
rule; GET's per-message mapping gained `attachmentMimeType`/
`attachmentDurationS` (already-selected columns, just not serialized
before). Mobile: two new dependencies, `expo-audio` (recording +
playback — the SDK 52+ replacement for the deprecated `expo-av`) and
`expo-document-picker`. New `useVoiceRecorder` hook wraps
`useAudioRecorder`/`useAudioRecorderState` into start/stop/cancel plus a
live duration; `src/utils/attachments.ts`'s `pickAttachmentFile` wraps
`expo-document-picker`, filtered to the same MIME types
`ALLOWED_MESSAGE_FILE_TYPES` (`lib/uploads.ts`) accepts so a doomed pick
never reaches the upload step. `sendConversationMessage` gained an
optional attachment param, building multipart via the same `File`-based
fix M14's first bug closed rather than the broken uri-object convention.
New `MessageAttachmentBubble` component renders both kinds: voice notes
get a play/pause button (`expo-audio`'s `useAudioPlayer`) with a duration
that counts down live once playing (falling back to the sender-supplied
label beforehand — the same "client-side duration, trusted for display
only" posture `resolveMessageAttachment`'s own comment already documents);
files get a type icon + filename, tapping opens via `Linking.openURL` (not
`expo-web-browser` — this may hand off to another app's viewer, e.g. a PDF
reader, which WebBrowser's in-app tab isn't meant for). The thread
composer's new attach (`+`) button opens a `BottomSheet` with "Record
voice note" / "Attach file"; picking either populates a dismissable
pending-attachment chip above the composer rather than sending
immediately, so Send stays the one actual send action (matching how the
text draft itself already works) — recording swaps the composer row for a
live timer + stop/cancel controls instead of a separate screen.

**Testing note**: no dedicated new automated tests for M14 — same posture
M13's own "no dedicated manual/simulator verification" line already
carried for most of this addendum, inverted here: this pass *was*
manually/live verified (that's how the two bugs were found and confirmed
fixed), but voice recording/playback specifically couldn't be
meaningfully exercised on this emulator (hardware-keyboard passthrough
means no on-screen keyboard either, and there's no real microphone input
path) — confirmed no crash through the full attach-menu → file-picker
round trip instead, which is the honest limit of what this environment
can verify.

Verification: `npx tsc --noEmit` clean (mobile and root) after every
change in this pass, root `npm run lint` — 0 errors (one real transient
false-positive during this pass: a stray `mobile/dist/` directory left
over from M13's own `expo export --platform web` verification step got
linted as source and produced ~8000 warnings on a minified bundle;
correctly gitignored, deleted, not a real finding), `npm test` — mobile
58/58, root 44/44 (one `auth.test.ts` timeout reproduced, confirmed the
same pre-existing flake M9/M10 already documented by re-running it alone
cleanly). Native rebuild required twice — once for `expo-clipboard`
(already covered by M13's own rebuild) and once more for `expo-audio` +
`expo-document-picker` — both installed via `npx expo install` (SDK-57-
resolved versions) and both new manifest permissions/services (RECORD_AUDIO,
MODIFY_AUDIO_SETTINGS) confirmed present via a clean `BUILD SUCCESSFUL` and
a crash-free app launch afterward.

### Sequencing

M8 first, regardless of the other three — it's the only track that makes
every subsequent change safer to ship. M9 and M10 touch disjoint code and
can run in parallel. M11's schema half turned out to already exist (§6);
its purchase-flow half is gated on non-engineering sign-off, not on any
other sub-phase here. M12 depended on none of M9-M11 — its only real
prerequisite was M8's reliability foundation, same as everything else.
M13 depended on M2 (widened its search route), M4-M6 (the screens/scopes
the widened search and the followers/following feature both needed
already provisioned), and M9/M10 (`BottomSheet`, `usePressScale`,
`MessagesStreamContext` — reused throughout, not rebuilt) — the first
sub-phase here with a real dependency chain rather than only sharing M8's
foundation. M14 depended on M13 directly (its own manual-verification pass
is what surfaced both bugs) and M3/M10 (`sendConversationMessage`,
`MessagesStreamContext`'s live event stream — presence and attachment
sending both build on the same conversation/message infra M3 established
and M10 made live).

## 7. Dependency vulnerability (image-size DoS) — fixed 2026-08-21

Previously recorded here as an accepted risk: `npm audit` in `mobile/`
reported high-severity findings tracing to **GHSA-w3rx-r6r6-pgpr** and
**GHSA-5p2g-fcmc-qvqq** (infinite-loop DoS in `image-size`'s ICNS/JXL/HEIF
parsers), pulled in transitively via Metro. At the time, no patched
`image-size` release existed upstream.

Metro shipped a backport on the `0.84.x` line (`metro@0.84.5`,
2026-08-19) that drops the `image-size` dependency from
`metro-transform-worker` entirely — note this fix is on the `0.84.x`
line specifically and has not (yet) been forward-ported to `0.85.x`+.
`mobile/`'s dependency tree had two copies of Metro: `@expo/metro`
resolved to the fixed `0.84.5`, but `react-native`'s
`@react-native/community-cli-plugin` (which allows `^0.84.3`) was still
resolving the older `0.84.4`. Added an `overrides` block in
`mobile/package.json` pinning `metro`, `metro-config`, and
`metro-transform-worker` to `0.84.5` so both copies dedupe to the patched
version. `npm audit` in `mobile/` now reports 0 vulnerabilities, and
`npx expo export --platform web` (Metro bundling smoke test) still
succeeds. Revisit the override once Expo/React Native bump their own
Metro floor past `0.84.5`.
