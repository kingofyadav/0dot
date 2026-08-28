# Mobile

Status: Foundational document. Covers the native mobile app (`mobile/`) — its
architecture, how it relates to the web app, its feature-parity status, and the
native-module gotchas that have bitten this project. The web PWA (`manifest.json`,
service worker, install prompt, web push) is **not** this document — that's part
of the web app and lives in `ENGINEERING_ARCHITECTURE.md` / `phase-15-mobile-apps.md`.
Last synced against the codebase 2026-08-27.

## What it is

`mobile/` is a separate Expo / React Native app (not a workspace of the web
app — its own `package.json`, own `node_modules`, excluded from the root
Next.js TypeScript project and from root `tsc`). It is 0dot's **first-party
iOS and Android client, built as a real OAuth2/PKCE client of the web app's
own public API** (`/api/v1`, Phase 10) — there is no privileged internal-only
path. The first-party app's OAuth scopes are auto-approved on boot by
`ensureFirstPartyApps()` (`src/lib/first-party-apps.ts`), so adding a new API
domain doesn't need a manual per-scope provisioning step.

- **Expo** `~57.0` (SDK 57), **React Native** `0.86`, **React** `19.2`, **Expo Router** `~57.0`, TypeScript throughout.
- **EAS project:** slug `zerodot`, owner `0dot` (the owner slug mismatch that broke EAS builds was fixed in a2fa08b — keep `mobile/app.json`'s `owner` as `0dot`).
- **OTA + releases:** `runtimeVersion` policy `appVersion`; `expo-updates` pointed at the EAS update URL. Three GitHub workflows: `mobile-ci.yml` (any `mobile/**` push/PR), `mobile-ota-update.yml` (push to `main`), `mobile-release.yml` (`mobile-v*.*.*` tags). Current release tag: `mobile-v1.0.1`.
- **Error tracking:** `@sentry/react-native` (`mobile/app.json` plugin, `disableAutoUpload: true`) — the web app has no equivalent, an asymmetry noted in `ENGINEERING_ARCHITECTURE.md`.
- **Tests:** Jest (`mobile/` has its own config; ~10 test files under `src/**/__tests__/`). Root `npm run lint` also lints `mobile/` — see the Reanimated note below.

## Architecture

- **Auth:** OAuth2 + PKCE via `expo-auth-session` (`src/auth/pkceAuth.ts`), tokens in **`expo-secure-store`** (not AsyncStorage — they're bearer-equivalent credentials), refresh-token grant with a silent-refresh path (`src/auth/tokenStorage.ts`, `AuthContext.tsx`). Optional biometric app lock (`expo-local-authentication`, `src/auth/biometricLock.ts`, `LockScreen.tsx`).
- **API client:** `src/api/client.ts` + `http.ts` — typed wrappers over `/api/v1`, cursor pagination (`{ items, nextCursor }`) matching `src/lib/pagination.ts` on the server.
- **Realtime:** started as REST-polling + push-driven refresh (M3 decision — the web app's SSE was in-memory, cookie-session-only, single-process). M10 added a **bearer-token SSE** path (`src/realtime/`) for messages/presence. **Realtime addendum (2026-08-29, `docs/specs/addendum-realtime-community.md`) — Phase A complete:** a shared cross-instance backplane in `src/lib/realtime/` — `bus.ts` (driver abstraction), in-memory + Upstash-Redis drivers (one `PSUBSCRIBE rt:*` per instance), with the 4 pub/sub modules + presence (`presence-store.ts`, self-healing sorted-set) refactored onto it so a publish on one Vercel instance reaches a subscriber on another. `presence.ts` changed shape (`isUserOnline` async, `getOnlineUserIds` batch, `refreshPresence` on the SSE heartbeat). Upstash provisioned via the Marketplace — env is `KV_REST_API_*` (not `UPSTASH_*`). Load spike (`scripts/realtime-load-spike.mjs`): 20 instances × 1000 msg @ 250/s → 100% delivery. **Phase B complete** — `mobile/src/realtime/messagesStream.ts` is now `createMessagesStream(...)` → `{setActive, close}`: AppState-gated (SSE closed while backgrounded), own exponential backoff, and a synthetic `resync` event on every reconnect that makes consumers refetch. `src/lib/push.ts` suppresses a push when the recipient has an open SSE stream (foreground = SSE, background = push). `mobile/src/utils/useAppForeground.ts` re-fetches the feed + notifications tabs on background→foreground. **Phase C complete** — community live chat on mobile: v1 routes at `communities/[slug]/chat/{route,[messageId],stream,typing}`, `CommunityChatEvent` enriched to carry the message payload + a `seq`, `src/screens/CommunityChatBody.tsx` + `app/community/[slug]/chat.tsx` (Chat button on the community screen), SSE connection logic extracted to the shared `src/realtime/eventStream.ts` (`createMessagesStream` + `createCommunityChatStream` are wrappers), and **`Last-Event-ID` replay** (`src/lib/realtime/replay.ts` — a short Redis ring buffer per channel; the chat stream replays exactly what a reconnecting client missed instead of a full refetch; `eventStream.ts` tracks the id and skips the client `resync` when it can replay). Open in C: the two-device send/receive pass — blocked on deploying the branch (the mobile build targets prod, which lacks these routes). Phases D–E (LiveKit voice, business signals) planned in that spec.
- **Push:** `expo-notifications` via Expo's relay (`src/push/`) — real delivery, not a stub. Web push is a separate third channel on the web side.
- **Offline:** `src/utils/offlineCache.ts` (AsyncStorage-backed) caches feed/profile for offline view; onboarding + tablet-responsive layout landed in Phase 15's mobile work.
- **Shared screen bodies:** `[username].tsx` (deep-linked profile) and `(tabs)/profile.tsx` (own profile tab) share one implementation, `src/screens/ProfileScreenBody.tsx` — the same "one implementation, two entry points" discipline the web app uses for `PostCard` etc.
- **Design tokens:** `src/theme.ts` mirrors the web token system — `shadow.{sm,md,lg}` approximates the web's dual-layer `--shadow*`, `motion.{fast,base,slow}` mirrors `--transition-*`, `on*` text-on-color tokens match. `src/utils/themePresets.ts` mirrors the web's profile theme presets. Not a second palette — deliberately the same visual language. **Redesign Phase 5** (`docs/specs/phase-0-redesign.md`) added `colors.surface2` / `colors.borderStrong` and the larger `space.{10,12,16}` steps to match the web redesign, adopted them in `Card` and the shared inputs (`SearchBar`, `PasswordInput`, edit-profile fields), and brought `EmptyState` to parity with the web component (icon in a soft accent disc, `title` + `description` + `action` slot; `message` still maps to `title`, `onRetry` stays for the error case). A later pass (2026-08-29) added the profile-header cover scrim (`expo-linear-gradient`, a bottom-weighted overlay mirroring the web `--overlay-scrim` stops) and brought `PostRow` + the post-detail stats row to web `.postActionsRow` parity: liked state is `colors.danger` (red filled heart, matching web's `.postAction[data-like]` — the one place a status hue is used non-decoratively, same as web), a hairline divider above the action zone, zero counts hidden, and a shared `formatCount` util (`999+` cap, mirrors `src/lib/format.ts`).

## Navigation

Tab bar: **Home / Explore / Messages / Notifications / Profile** (restructured
from the Phase 15 Home/Notifications/Settings). Profile is the signed-in user's
own profile (X/Threads/Instagram pattern); Settings moved from a tab to a
pushed screen (`app/settings.tsx`) reached via a gear on the Profile tab.
~36 screens under `app/` (feed, post detail, profile, communities, businesses,
events, marketplace, wallet, messages, compose, bookmarks, and the full
settings tree — see Parity below).

## Feature parity with web (as of the M1–M14 pro-upgrade addendum)

Tracked in `docs/specs/addendum-mobile-pro-upgrade.md` — that spec's sub-phase
status line is authoritative. Summary:

| Area | Mobile status |
|---|---|
| Feed, single post, compose, like/repost/bookmark | **Built** |
| Search / Explore | **Built** — two tabs (People / Posts), not web's eight |
| Messages / DMs | **Built** — text + (M14) voice notes & file attachments; started REST-polling, now bearer-token SSE (M10) |
| Communities | **Built** — browse/join/post; **live chat** (Phase C); **voice rooms** on LiveKit — web + mobile code complete (Phase D), pending a mobile dev-client rebuild + device audio pass |
| Businesses, Marketplace | **Built, browse-only** |
| Events | **Built** |
| Wallet | **Built (partial)** — balance + P2P coin transfer only; top-up / payout / VIP purchase deferred (don't fully exist on web either) |
| Notifications | **Built** — with preferences (M12) |
| Settings / account parity | **Built (M12)** — edit profile, preferences, privacy, blocked users, notification prefs, change password, **2FA**, **sessions**, **contact change**, account management |
| Bookmarks | **Built** |

**Deferred / not built on mobile:** native in-app purchase (M11 —
engineering half only; the legal-gated purchase flow and finance-ops
disbursement are not buildable by the addendum alone), wallet top-up/payout.

**Needs a dev-client rebuild before it runs:** the Phase D voice-room screen
(`@livekit/react-native` + `@livekit/react-native-webrtc` are native
modules; `@config-plugins/react-native-webrtc` is in `app.json`). Same
`eas build --profile development` step as the other native-dep additions
below.

## Native-module gotchas (learned the hard way — see also `mobile/AGENTS.md`)

- **`mobile/AGENTS.md` is deliberately terse:** *"Expo HAS CHANGED. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code."* Expo 57 has breaking changes from most training data — same spirit as the web repo's own `AGENTS.md`.
- **Some modules need a rebuilt dev client, not plain Expo Go.** Reanimated, `expo-sharing`, `expo-file-system` (and the `expo-dev-client` dep itself) — a plain `expo start` against Expo Go will crash the screen that imports them. This bit the M12 account-management screen. Rebuild the dev client (`eas build --profile development`) after adding a native dep.
- **`expo-notifications` crashes in Expo Go** — guarded so the app still runs there; real push only works in a dev/production build.
- **Reanimated 4:** the Babel plugin is `react-native-worklets/plugin` (not `react-native-reanimated/plugin`), it must be **last** in the Babel plugin list, jest needs the Reanimated mock, and the root ESLint config reaches into `mobile/` — a Reanimated-specific lint rule pitfall from M9. See `feedback_mobile_reanimated_gotchas` in memory.
- **Metro image-size DoS:** patched (M-era Dependabot); the residual moderate alerts are documented as accepted risk.
- **`uuid` forced to 11.1.1**, `react-dom` pinned to match `react` — both to close npm-audit findings specific to the mobile tree.

## Relationship to other docs

- API surface it consumes: `phase-10-developer-platform.md`, `src/lib/api-auth.ts`, `src/app/api/v1/*`.
- Feature specs it ports: `phase-2` (social), `phase-3` (communities), `phase-4` (business), `phase-8` (events), `phase-9` (marketplace), `addendum-coin-wallet`.
- The web PWA half of "Phase 15": `phase-15-mobile-apps.md`, `ENGINEERING_ARCHITECTURE.md`.
- Design token parity: `DESIGN_SYSTEM.md` (the web source of truth `mobile/src/theme.ts` mirrors).
