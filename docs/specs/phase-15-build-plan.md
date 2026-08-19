# Phase 15 — Mobile Apps: build plan (saved for later)

> Companion to the spec at [phase-15-mobile-apps.md](phase-15-mobile-apps.md).
> Unlike every other build plan in this series, this one exists to scope a
> **gap**, not a full implementation pass: commit `2f927c7` ("Build 0dot.in
> Phase 15-16: mobile apps and future modules") already shipped nearly all of
> this spec's *server-side* surface. What's missing is narrower and more
> concrete than "build Phase 15" — it's one thing: an actual client app, plus
> one REST endpoint that client will need and doesn't have yet.

## What's already shipped (verified against the current tree, not assumed)

- **§3 First-party OAuth clients** — `src/lib/first-party-apps.ts` registers
  the iOS/Android/Desktop apps as real `DeveloperApp` rows owned by a
  designated `platform-apps@0dot.internal` `User`, pre-approves every scope
  (so nothing sits behind §4.3's admin review gate), and reuses the same PKCE
  flow (`oauth.ts`) a third-party app goes through. The connected-apps list
  lives at `src/app/s/[username]/authorized-apps/page.tsx`. Correction to an
  earlier read of this section: `src/app/oauth/authorize/page.tsx` renders
  the consent screen for every app, first-party included — §3.3's "skip the
  screen" UX option was *not* actually taken, only the "every scope stays
  pre-approved" half was. Not a bug (showing it is the safer default), just
  a claim this doc previously overstated.
- **§4 Push as a third delivery channel** — `DeviceToken` +
  `NotificationDeliveryPreference` (schema.prisma) and `src/lib/push.ts`'s
  `dispatchPushEvent` are wired into `notifications.ts`'s existing
  `createNotification` path. Payload copy reuses `getNotificationVerb` — the
  same generic text already shown in-app, satisfying §4.3's sensitivity
  principle. `clearWebPushTokensForUser`/`clearDeviceTokensForApp` are called
  from `session.ts`/`oauth.ts` revocation paths, satisfying §4.4. The actual
  send is a `StubPushProvider` no-op — same "swappable interface, no live
  credentials yet" posture as `payments.ts`'s processor abstraction, not a
  gap specific to this phase.
- **§5.2 PWA / desktop** — `public/manifest.json` + `public/sw.js` ship a
  read-time-only cache (§5.2's explicit v1 scope: no queued-write replay).
  This resolves §8's "PWA or native desktop?" question in the PWA's favor —
  already decided, not still open.
- **§5.3 Universal/app links** — `src/app/.well-known/apple-app-site-association/route.ts`
  and `.../assetlinks.json/route.ts` cover every namespace, with
  `in.0dot.ios` / `in.0dot.android` as the real bundle/package IDs and
  `TEAMID` / a zeroed cert fingerprint as placeholders — same "real
  structure, placeholder credential" posture as the OAuth/payments stubs,
  blocked only on actual Apple/Google developer accounts existing.
- **§6 IAP schema** — `PaymentTransaction.processor`/`storeFee` and the new
  `IapPayoutBatch` model (schema.prisma) give `CreatorPayoutAccount`'s
  single-value `processor` enum its second value, per §6.2. This is schema
  only, correctly: §6.3 flags the actual reconciliation/disbursement
  workflow as its own dedicated undertaking, and no real purchase can flow
  through `apple_iap`/`google_play_billing` without an app to make it and a
  developer account to process it — same blocker as the placeholder bundle
  IDs above.

None of this needed rebuilding. §8's open questions are, in practice,
mostly already answered by what shipped: PWA-as-desktop (yes), offline
write-queueing (confirmed out of scope, `sw.js`'s own comment says so).
First-party consent-screen skip was *not* taken (see correction above —
the screen always renders). The two genuinely still-open items are §5.1's
cross-platform mobile codebase (nothing built, until this pass) and §6's
IAP compliance strategy (schema ready, integration blocked on real store
accounts — not a code task to pick up now).

## The actual gap

1. **No mobile client exists.** No Expo/React Native/Flutter project
   anywhere in this repo or on this machine — every piece above was built
   to be *consumed* by a client that was never scaffolded. This is the
   "zero footprint" the roadmap check flagged.
2. **`registerDeviceTokenAction` is a Next.js server action, not a REST
   endpoint** (`src/app/actions/push.ts`, `"use server"`). Server actions
   bind to this app's own React render tree — an external mobile app
   authenticating with a bearer token per Phase 10's model cannot call it.
   The three existing `/api/v1/*` routes (`users/me`, `profiles/[username]`,
   `posts/[id]`) all resolve the caller via `resolveApiRequest` and call the
   same underlying lib functions the web UI uses (Phase 10 build plan's
   "reused-authorization posture"); device-token registration needs the same
   treatment, since it's the one first-party-app action with no REST path
   today.

## Recommendation before scaffolding

Build a real Expo (React Native) app, not Flutter — this repo is already
TypeScript/React end to end, so Expo reuses the team's existing language
and component mental model rather than introducing a second one, and it's
literally the example the spec names in §5.1. Keep it a **sibling
top-level directory** (`mobile/`) with its own `package.json`/lockfile —
this repo has no npm workspaces today, and forcing a monorepo migration
just to add one client is a bigger change than this gap calls for.

**Before writing app code**, confirm with product/eng (§8, still open):
team size/budget for maintaining a real cross-platform app, and whether
tablet gets its own adaptive layout pass in v1 or ships as a stretched
phone layout initially. Everything else in §8 is already resolved by what
shipped (see above).

**Do not build against the placeholder Apple/Google credentials as if
they were real** — universal links, push, and IAP all silently no-op or
fail against `TEAMID`/the zeroed cert fingerprint until real developer
accounts exist. Structure the app so those three integrations are the
easy last step of plugging in real values, not something load-bearing in
earlier steps.

## Build sequence

1. `npx create-expo-app mobile --template` (TypeScript) — bare scaffold,
   no business logic yet.
2. Expose `registerDeviceTokenAction`'s three operations as a real
   bearer-authenticated REST surface (`/api/v1/device-tokens`, following
   `/v1/posts/[id]`'s `resolveApiRequest` pattern exactly) — the one actual
   missing backend piece, small enough to land before or alongside the
   client.
3. PKCE login screen: `expo-auth-session` against the already-shipped
   `/oauth/authorize` + token endpoints, using the real `0dot-ios://` /
   `0dot-android://` redirect URIs `first-party-apps.ts` already
   registered. Store tokens via `expo-secure-store`, never plain
   `AsyncStorage` (parallels this codebase's `accessTokenHash`/
   `encryptAtRest` posture for anything bearer-equivalent).
4. Thin API client against the existing `/v1/users/me`, `/v1/profiles/:username`,
   `/v1/posts/:id` routes — proves the OAuth token actually authorizes real
   requests before building UI on top.
5. Push registration: `expo-notifications` device token → step 2's new
   endpoint. Sending stays a no-op end to end until `push.ts`'s
   `StubPushProvider` is swapped for real APNs/FCM credentials — a
   follow-up outside this gap's scope, same as the OAuth/IAP stub swaps.
6. Universal/app link handling: `expo-linking`, pointed at the
   already-published association files — functionally inert until real
   `TEAMID`/signing-cert values replace the placeholders, but the client
   code doesn't need to change when that happens.
7. Biometric app-unlock (§7): `expo-local-authentication` gating an
   already-valid session token from step 3 — no backend change, safe to
   slot in anywhere once step 3 lands.
8. In-app purchases (§6): explicitly deferred past this build — needs a
   real Apple/Google developer account and the dedicated legal/finance
   reconciliation work §6.3 already flagged, not something to start
   speculatively against placeholder store credentials.

## Progress

**Steps 1–3 done.** Two real gaps surfaced during step 3 that weren't
visible until an actual client tried to complete the flow, both fixed:

- **Token endpoint required a `client_secret` from every client,
  unconditionally** (`api/oauth/token/route.ts`) — a distributed app binary
  has nowhere safe to hold one, so this made native PKCE login impossible
  in practice despite being the exact case §3.2 says PKCE exists for. Fixed
  by adding `DeveloperApp.isPublicClient` (default `false` — no behavior
  change for any existing third-party app), set `true` for the three
  first-party apps, and skipping the secret check for those — PKCE's
  `code_verifier` is their sole proof of possession now, standard RFC 8252
  posture.
- **No way for a compiled app to know its own `client_id`** —
  `first-party-apps.ts` generates it randomly per environment, so it can't
  be hardcoded. Added an unauthenticated `GET /api/oauth/first-party-clients`
  (`client_id` isn't sensitive — it's already visible in the browser-facing
  authorization redirect) returning `{ ios, android, desktop }`.

Also added the `push:write` OAuth scope (nothing previously gated device-
token registration) and deduped the platform-list literal into
`push.ts`'s `PUSH_PLATFORMS`.

**Known, deliberately unfixed gap**: the token endpoint only implements
`grant_type=authorization_code` — `refresh_token` is minted and returned
but has no exchange path, so `mobile/src/auth/pkceAuth.ts` can't actually
renew a session; today an expired 1-hour access token means running
`signIn()` again (a fresh browser round-trip). Small to fix, but separate
from what step 3 needed to prove the login flow works — flagged here for
whichever step first needs a session that outlives an hour.

`mobile/` (Expo SDK 57, TypeScript) now has: `app.json` wired to the real
bundle/package identifiers and both redirect schemes (see the naming
correction under steps 5–7 below — the identifiers changed after this was
first written); `src/config.ts`, `src/auth/tokenStorage.ts`
(`expo-secure-store`), and `src/auth/pkceAuth.ts` (`expo-auth-session`);
`App.tsx` as a minimal sign-in/sign-out smoke screen.

**Step 4 done.** `mobile/src/api/client.ts` (`getMe`/`getProfile`/`getPost`
against `/v1/users/me`, `/v1/profiles/:username`, `/v1/posts/:id`) and
`mobile/src/api/types.ts` (response shapes mirrored exactly from each
route's `Response.json()`, not re-guessed). `App.tsx` now calls `getMe()`
immediately after sign-in and on cold start with stored tokens still
present — this is the actual proof step 4 exists to produce: a PKCE-issued
token authorizing a real bearer-authenticated request, not just a
successful token exchange. A `401` from any call (the still-unfixed
missing-refresh-grant case above, or a revoked authorization) drops the
app back to signed-out with an explanatory message, since there's no
refresh path to retry silently.

**Steps 5–7 done**, plus a real naming bug the build's own tooling caught:

- **`in.0dot.ios`/`in.0dot.android` and `0dot-ios://`/`0dot-android://`
  were never valid identifiers**, and this had shipped since commit
  `2f927c7` — a URI scheme must start with a letter (RFC 3986 §3.1), and an
  Android `applicationId` follows Java package-naming rules, where every
  segment must start with a letter too. Neither was exercised by real
  tooling until `mobile/app.json` declared them and `expo-doctor` (21/21
  checks, one initially failing) caught both. Fixed by renaming to
  `zerodot-ios://`/`zerodot-android://` and `in.zerodot.android` everywhere
  they're referenced: `first-party-apps.ts`'s `redirectUris` (with the
  existing-row self-heal extended to patch `redirectUrisJson` forward, the
  same idiom already used for `isPublicClient`), `assetlinks.json`'s
  `PACKAGE_NAME`, and `mobile/app.json`/`src/config.ts` on the client side.
  `in.0dot.ios` (iOS's `bundleIdentifier`) is unaffected — Apple's bundle ID
  format has no equivalent leading-letter rule, and `expo-doctor` didn't
  flag it.
- **Step 5 — push registration**: `mobile/src/push/registerPush.ts`
  requests notification permission, sets up the Android default channel,
  and registers the *native* APNs/FCM device token (`getDevicePushTokenAsync`,
  not Expo's own relay-service token) against step 2's
  `/api/v1/device-tokens` — matching `DeviceToken.token`'s "opaque
  APNs/FCM/Web-Push token" schema comment rather than introducing a third
  token shape `push.ts`'s real-provider swap-in wouldn't expect. Runs
  automatically once a session is established (fresh sign-in or unlock),
  best-effort (a denied permission or simulator's missing hardware doesn't
  block the rest of the app). Sending is still `StubPushProvider`'s no-op
  end to end — registration works, delivery doesn't, until real APNs/FCM
  credentials exist.
- **Step 6 — universal/app links**: `mobile/app.json` gained
  `ios.associatedDomains: ["applinks:0dot.in"]` and an Android
  `intentFilters` entry for `https://0dot.in` (`autoVerify: true`),
  matching the already-published `apple-app-site-association`/
  `assetlinks.json` exactly. `mobile/src/links/universalLinks.ts` receives
  the parsed URL at runtime and `App.tsx` displays it ("Opened via: ...")
  as the same "prove it, don't just wire it" check every other step used —
  there's no router/screen set yet to actually navigate anywhere. The
  *https* path stays unverifiable until real `TEAMID`/signing-cert values
  replace the placeholders (per the build plan's original recommendation);
  the custom-scheme redirect the OAuth flow already uses is live today.
- **Step 7 — biometric app-unlock**: `mobile/src/auth/biometricLock.ts`
  (`expo-local-authentication`) gates revealing an already-stored session
  behind Face ID/fingerprint on cold start, only when the device actually
  has biometric hardware enrolled — skipped entirely otherwise, since §7 is
  a convenience layer, not a new authentication requirement a device
  without it should be locked out by. No backend change, as the spec
  expects.

Verified: `mobile`'s `expo-doctor` (21/21), `tsc --noEmit`, and `expo config`
all clean; root `tsc`, `eslint`, and the full test suite (31/31) all pass.

Remaining from the original sequence: step 8, in-app purchases, stays
explicitly deferred — real Apple/Google developer accounts and the
dedicated legal/finance reconciliation work (§6.3) are prerequisites this
build can't manufacture. With steps 1–7 done, `mobile/` is a working,
device-testable proof of the whole first-party flow: PKCE login, an
authorized API call, push registration, deep-link receipt, and biometric
unlock — not yet a real app with actual content screens, which was never
this pass's goal.

## Review pass + direct-download distribution

A full review of steps 1–7 found and fixed six real bugs, none of them
hypothetical — each was reachable from a plausible real-world path:

- **App.tsx's cold-start effect had no try/catch/finally** — `getStoredTokens`/
  `isBiometricLockAvailable` throwing (e.g. `expo start --web`, where
  SecureStore/LocalAuthentication aren't implemented) left `setLoading(false)`
  unreached: a permanently stuck spinner with no recovery.
- **The locked screen had no escape hatch** — a device whose biometrics
  stopped working (broken sensor, un-enrolled) could neither unlock nor
  sign out of an already-valid session. Added a "Sign out instead" button.
- **`handleUnlock` didn't catch a reject from `authenticateAsync`** — same
  stuck-screen shape as the first bug, scoped to the unlock button specifically.
- **No fetch timeout anywhere** (`client.ts`, `pkceAuth.ts`'s `fetchClientId`) —
  a captive portal or dropped connection hung the calling `await` forever.
  Added `mobile/src/api/http.ts`'s `fetchWithTimeout` (15s, `AbortController`),
  used by both.
- **`tokenStorage.loadTokens()` used truthiness, not null-checks** — a stored
  empty-string refresh token (defensively allowed by `pkceAuth.ts`'s old
  `?? ""` fallback) would make a perfectly valid access token invisible after
  restart. Fixed both ends: `loadTokens` now checks `== null`, and `signIn()`
  throws instead of ever storing `""`.
- **`/api/oauth/first-party-clients` had no rate limit** — unauthenticated
  and DB-touching, same category the rest of this codebase always rate-limits.
  Added the same per-IP `checkRateLimit` posture as the oauth token endpoint.

Also swapped `mobile/`'s placeholder Expo icons for the site's real brand
mark (`public/0dot.png`) across `icon`, Android `adaptiveIcon`, and splash
(`expo-splash-screen`, background `#000000` to match `manifest.json`) —
the app no longer looks like an unbranded scaffold.

**Distribution reality check** (the actual reason this section exists):
asked for "download from a direct web link, skip the app stores." That's
fully true for **Android** — an APK can be installed straight from a
webpage, Play Protect warning aside. It is **not** true for **iOS**: Apple
does not permit installing an app outside App Store review via a plain
download link, full stop. The only non-App-Store paths are TestFlight
(still requires an Apple Developer Program account + an App Store Connect
record — closest thing to "direct link" iOS allows, capped at 10,000
testers) or ad-hoc distribution to individually pre-registered device
UDIDs (100/year). This isn't an engineering gap to build around — it's
Apple's platform policy.

Built accordingly:
- **`mobile/eas.json`** — `preview` profile: Android `buildType: apk`
  (produces a directly downloadable APK), iOS `internal` distribution
  (produces a TestFlight/ad-hoc-ready build, not a bare download link).
  `production` profile kept for eventual store submission, uncommitted to.
- **`src/app/download/page.tsx`** — a real page on the existing web app,
  server-side user-agent detection highlighting the visitor's own
  platform. Android/iOS links are driven by `ANDROID_APK_DOWNLOAD_URL`/
  `IOS_TESTFLIGHT_URL` env vars, both unset today — shows an honest
  "coming soon" rather than a fabricated link, since no real build exists
  yet. Desktop visitors get pointed at the already-shipped installable PWA.

**What's still needed before either link goes live**: an Expo/EAS account
(`eas login`), then `eas build --profile preview --platform android` for
the direct APK — that part just works. iOS additionally needs an Apple
Developer Program enrollment ($99/year) before any build can reach a
device at all, TestFlight or otherwise. Neither of these is something this
session can do on your behalf — they need your own account and, for iOS,
Apple's paid enrollment.
