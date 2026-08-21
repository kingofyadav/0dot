# Addendum — Mobile Pro-Level Upgrade

Status: M1–M7 built
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

## 4. What's still deferred (M8+ candidates, not queued as a numbered sub-phase)

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

## 6. Dependency vulnerability (image-size DoS) — fixed 2026-08-21

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
