# Changelog

Milestone-level history of 0dot.in — phase builds, integration go-lives, mobile
releases, and notable fixes. **Not** a per-commit log; see `git log` for that.
Reconstructed from git history on 2026-08-27, then maintained forward at
phase / integration / mobile-release boundaries.

The product is live at **0dot.in**. There are no semver web releases yet, so
entries are grouped by date. The mobile app is separately versioned
(`mobile-v*` tags).

---

## 2026-08-31 — Coin Wallet v2 — second review pass (findings 1–8)

- **Repeatable coin purchases carry a per-submission idempotency token.**
  New `<IdempotencyField>` puts a `crypto.randomUUID` in every coin
  purchase form (tip, donation, offering, ticket, Premium, business plan),
  rotated after each settled submit; the actions pass it through
  `coinActionKey`. A double-click / retry still dedupes, but a *deliberate*
  repeat (two $5 tips, two tickets, an extra month of Premium) is no longer
  collapsed onto the first charge with a phantom second "success". The
  no-JS fallback (`coinIdempotencyKey`) drops from a 30s to a 12s bucket.
- **Wallet activity labels come from the PaymentTransaction kind.**
  `listLedgerEntries` resolves the linked `PaymentTransaction.kind` (+ a
  `direction`) so a coin sale reads as "Tip received" / "Store sale" /
  "Ticket" instead of a bare "Purchase"; `/wallet` and the business wallet
  share one `walletActivityLabel` (was two drifting `KIND_LABEL` maps, half
  of whose entries could never match).
- **Deduped coin-ticket resubmit** no longer fires a second
  `ticket_purchased` notification or reports success for a ticket it didn't
  issue (`captureHold`'s `alreadySettled` is now respected in
  `purchaseTicket`).
- **`runPromoExpirySweepOnce` sweeps `business_promo` too** — a business
  promo grant with a TTL now expires like a user's (was silently kept
  forever).
- **Transfer velocity is checked inside the DB transaction** so concurrent
  transfers can't jointly exceed the daily coin / recipient caps.
- **CSV statement export neutralizes formula-leading memos** (`= + - @`
  prefixed with `'`) — an admin grant/refund reason can't execute when the
  file is opened in Excel / Sheets.
- **`PurchaseVipForm`** offers a monthly/yearly choice with the price and
  the affordability check both driven by the selection (and by the existing
  subscription's interval on renew), and disables the renew button when the
  wallet can't cover it.
- **`scripts/wipe-users.ts`** clears the coin ledger (`LedgerHold`,
  `LedgerPosting`, `LedgerTransaction`, owned `LedgerAccount` rows) and
  `ReferralCode`, and zeroes the surviving system account balances, so a
  dev wipe + reseed starts reconciliation-clean.

## 2026-08-30 — Coin Wallet v2 — pre-commit review & hardening pass

- **Idempotency is now a true no-op.** `postTransaction` returns
  `{ transaction, created }`; `transferCoinsCore` and
  `maybeGrantReferralReward` skip their side-effects (a second `CoinTransfer`
  row, duplicate `coins_received` notifications) on a key replay. Repeatable
  coin actions (tip, donation, membership, ticket, Premium, business plan)
  use a 30-second-bucketed idempotency key (`coinIdempotencyKey`) so a
  double-click can't double-charge; the subscription writes are guarded on
  the charge actually being new.
- **Ledger pagination fixed** — `listTransactions` cursors on a
  `(createdAt, id)` tuple; a transaction's 2–3 same-timestamp postings no
  longer get dropped at a page boundary.
- **`§6.4` is reachable in the UI.** Tip / subscribe / digital-product /
  course / offering / ticket / donation forms now render for any signed-in
  viewer (not just when the creator has a Stripe payout account) — the coin
  button shows alone when there's no card rail, disables/hints on an empty
  wallet. New `cardAvailable` / `viewerCoins` props threaded from the
  profile, services, course, event, business-store and fundraiser pages.
- **`LedgerTransaction.expiresAt`** is a real indexed column (migration
  `20260830130749_ledger_txn_expires_at`, backfilled from the old
  `metadataJson`). The promo-expiry sweep queries it instead of scanning
  every promo account.
- **Reconciliation & overview scale**: mismatched-account and unbalanced-
  transaction checks are `$queryRaw` (only bad rows return); `getWalletOverview`
  and the referral sweep use `groupBy` / a rewarded-set filter instead of
  loading every row.
- Admin daily issuance cap counts **gross** coin movement (a downward
  correction no longer refunds cap headroom); `refundToWallet` is idempotent
  and no longer writes a bogus second `PaymentTransaction`; dead
  `spendUserCoins` removed; stale `coinBalance` comments cleared.

## 2026-08-30 — Coin Wallet v2, Phase 7 (referral rewards) — build complete

- **Referral rewards** (`addendum-coin-wallet-v2.md` §7.5): `ReferralCode`
  (one per user, minted lazily) + `User.referredByUserId` (nullable self-FK,
  migration `20260830123340_add_referral_rewards`).
- `/join/<code>` landing route sets a first-party, `httpOnly`, 30-day `ref`
  cookie; `signup` reads it and writes `referredByUserId` once (self-referral
  and unknown codes are silent no-ops).
- `maybeGrantReferralReward` — pays **both** parties `REFERRAL_REWARD_*_COINS`
  (3/3) into the restricted bucket, only once the invitee is email-verified
  **and** has done a meaningful action (a post, a link, or any purchase).
  Idempotent on `referral_reward:${inviteeUserId}`. Gated on the inviter
  being verified, past the account-age bar, and under the lifetime cap (25).
  Fired eagerly from `/verify` and swept daily (`runReferralRewardSweepOnce`).
- `GET /api/v1/wallet/referral` + a "Invite & earn" card on `/wallet`.
- This completes `addendum-coin-wallet-v2.md` §17 (Phases 0–7).

## 2026-08-30 — Coin Wallet v2, Phase 6 (real pricing + launch promo)

- **Real Premium price in coins** (`addendum-coin-wallet-v2.md` §14):
  removed `TEST_MODE_VIP_COIN_COST`. `purchaseProfilePremiumWithCoins` now
  charges the real `PLAN_PRICES` value (6 coins/mo, 60/yr) through
  `chargeWallet` (no external payee → whole amount is platform revenue,
  and the coin spend gets a `platform_subscription_charge` PaymentTransaction
  with `processor: "wallet"`). `purchaseBusinessPlanWithCoins` likewise
  charges the real 20/200-coin business price from the business wallet.
- **Launch promo** (§8.1): `issueLaunchPromoIfEligible` — accounts created
  before `WALLET_LAUNCH_PROMO_ENDS_AT` (default ship date + 90d,
  env-overridable) get a second restricted, 90-day `promo_grant` of
  `LAUNCH_PROMO_COINS` (6) alongside the base signup grant, in the same
  transaction.
- **`User.coinBalance` dropped** (§16 step 5, migration
  `20260830120000_drop_user_coin_balance`): the double-entry ledger is the
  sole source of truth. `syncCoinBalanceMirror` and every dual-write call
  removed across the wallet module and `auth.ts`.
- **Anomaly scan** (§11.4): `runWalletAnomalyScanOnce` in the daily cron —
  flags issuance spikes (vs trailing 7-day mean), sybil-shaped inbound
  transfer fan-in, and admins near their daily issuance cap. Logs only,
  never blocks.

## 2026-08-30 — Coin Wallet v2, Phase 5 (surfaces + API)

- **Transfer hardening** (`addendum-coin-wallet-v2.md` §5.2/§11.2):
  `src/lib/wallet/eligibility.ts` — `checkTransferEligibility` (recipient
  live, no block either way, sender email-verified + past
  `TRANSFER_MIN_ACCOUNT_AGE_HOURS`) and `checkTransferVelocity` (per-day
  coin ceiling + distinct-recipient cap), applied in `transferCoinsCore`
  so both the web action and `/api/v1/wallet/transfer` get them.
- **Admin grant tool** (§7.4/§11.3): `issuePromoGrant` (restricted bucket,
  optional TTL) and `adminAdjust` (spendable, or a downward correction) —
  each with a required reason, a per-admin daily issuance cap, and a hard
  ceiling above which the self-serve tool refuses. `grantCoinsAction` +
  `/admin/wallet` rewrite (overview stats, issuance audit, grant form).
- **API** (§13.4): `GET /api/v1/wallet/transactions` (cursor-paginated
  ledger), `POST /api/v1/wallet/purchases` (`target: "premium" | "tip"`),
  `GET /api/v1/wallet?scope=business&businessId=` (owner/admin only).
- **`/wallet` rewrite**: activity is now the full ledger (`listTransactions`,
  cursor pagination, "Load older"), plus a **`/wallet/statement`** CSV
  export route (running balance, `from`/`to` range).
- No migration.

## 2026-08-30 — Coin Wallet v2, Phase 4 (business wallets)

- **`business_wallet` / `business_promo` accounts** (`addendum-coin-wallet-v2.md`
  §6.5): `ensureBusinessAccounts`, `getBusinessWalletBalance`,
  `spendBusinessCoins`, `listBusinessTransactions`. No migration —
  `LedgerAccount.ownerBusinessId` + its unique index shipped in Phase 1.
- **Business as coin payee**: `chargeWallet` / `captureHold` /
  `settleCoinPurchase` now credit a `business_wallet` when
  `payeeBusinessId` is set. Wired: business-owned Store offerings
  (`purchaseOffering` → `business_purchase`) and business-hosted ticketed
  events (`purchaseTicket` hold→capture). Phase 3's "card only" fallbacks
  for these are removed.
- **Business subscription in coins**: `purchaseBusinessPlanWithCoins` +
  `subscribeBusinessWithCoinsAction` (owner/admin only, per
  `WALLET_LIMITS.BUSINESS_SPEND_ROLES` / `isBusinessStaff`) — spends the
  business wallet on the 0dot business plan; `expireLapsedCoinMemberships`'s
  sibling logic (existing coin-subscription sweep) ends it on lapse.
- **Business Wallet tab** (`/b/[slug]/manage/wallet`): balance, recent
  activity, and the coin-subscription spend action — visible to any team
  member, spendable by owner/admin. New "Wallet" tab in `BusinessManageNav`.
- No P2P / cross-wallet: a `business_wallet` is never a transfer source or
  destination (unchanged — `transferCoinsCore` is user-only).

## 2026-08-30 — Coin Wallet v2, Phase 3 (holds + async features)

- **`src/lib/wallet/holds.ts`** (`addendum-coin-wallet-v2.md` §9): `placeHold`
  (payer coins → `system_escrow`, promo/spendable split recorded on the hold
  txn), `captureHold` (escrow → payee + fee, runs the feature's
  `createRows`), `releaseHold` (escrow → payer, restoring the exact
  buckets). `hold-expiry` cron releases abandoned pending holds.
- **Event tickets — coin path**: `purchaseTicket` gains a `payWith: "coins"`
  branch that `placeHold` → `captureHold` (issues the ticket, bumps
  `quantitySold`, pays the host); no payout account needed. Shared
  `createTicketRow` extracted for the webhook + coin rails.
- **Store / freelance offerings — coin path**: `purchaseOffering` coin branch
  (synchronous `settleCoinPurchase`, individual sellers; business payees
  wait for Phase 4). Shared `createOfferingPurchaseRow`.
- **Memberships — first period in coins**: `subscribeToTier` coin branch
  charges one period via `chargeWallet` and creates a `coin:`-marked
  `MembershipSubscription`; `expireLapsedCoinMemberships`
  (`platform-billing.ts` sweep) ends it when the period elapses. No
  auto-renew from coins.
- "Pay with coins" buttons on the ticket, offering, and subscribe forms.
- Deferred: appointment bookings (they carry no payment path today — a new
  feature, not a coin-rail add); business-payee coin tickets/store sales
  (Phase 4).

## 2026-08-30 — Coin Wallet v2, Phase 2 (coins as payment)

- **`chargeWallet` / `settleCoinPurchase`** (`src/lib/wallet/charge.ts`,
  `addendum-coin-wallet-v2.md` §6): a coin purchase now writes a
  `PaymentTransaction` with `processor: "wallet"` (backed by the ledger
  transaction) plus a balanced `LedgerTransaction` — payee credited in
  coins, `system_platform_revenue` credited the `resolveFeeRate` fee.
- **`activateXxx` split into shared row-creation** (`createTipRow`,
  `createDonationRows`, `createDigitalPurchaseRow`, `createCoursePurchaseRow`)
  reached by both the Stripe webhook and the coin rail — the feature row is
  created in exactly one place (§6.2).
- **Coin path on tips, donations, digital products, courses**: each action
  gains a `payWith: "card" | "coins"` branch; the coin branch skips the
  payee's payout-account gate (§6.4) and settles synchronously. "Pay with
  coins" buttons added to the four forms.
- `notifyCoinsReceived` (`coins_received` notification type) — fires on P2P
  transfers and coin refunds; coin tips still fire `tip_received` only.
- `refundToWallet` (§7.3): credit a refund to the payer's spendable wallet
  from `system_refund_source`, mark the original refunded; idempotent. No
  caller yet (refund policy is Phase 5).
- `User.coinBalance` mirror is now recomputed from the ledger
  (`syncCoinBalanceMirror`, rounded) rather than incremented, so
  cents-precise coin pricing doesn't corrupt it.

## 2026-08-30 — Coin Wallet v2, Phase 1 (ledger core)

- **Double-entry coin ledger** (`addendum-coin-wallet-v2.md` §4): new
  `LedgerAccount` / `LedgerTransaction` / `LedgerPosting` / `LedgerHold`
  models (migration `20260830110844_add_coin_ledger`), seeded system
  accounts, and a backfill that moves every existing `User.coinBalance`
  into that user's restricted (promo) bucket via a `migration_opening`
  transaction. Amounts are integer minor units (1 coin = 100).
- **`src/lib/wallet/`**: `accounts.ts` (account resolution), `ledger.ts`
  (`postTransaction` with the sum-zero assertion + non-negative owner
  guard, `getWalletBalance`, `spendUserCoins`, `listTransactions`),
  `grants.ts` (`issueSignupGrant`), `transfer.ts` (shared transfer core),
  `limits.ts` (`WALLET_LIMITS`), `reconcile.ts`, `expiry.ts`.
- **Existing flows dual-write + read from the ledger**: signup grant
  (`auth.ts`, now an audited `signup_grant` transaction), P2P transfer
  (action + `/api/v1/wallet/transfer`, spendable bucket only — promo is
  never a transfer source), and coin-funded Premium (`platform-billing.ts`,
  promo-first-then-spendable, crediting `system_platform_revenue`).
  `User.coinBalance` stays as a mirror until Phase 6.
- **Crons** (hourly bucket): `wallet-reconcile` (global sum-zero check,
  cachedBalance drift auto-heal) and `promo-expiry` (FIFO clawback of
  unspent expired grants).
- Tests: ledger primitives, sum-zero/idempotency/overdraft, signup-grant
  wiring, reconciliation; `wallet.test.ts` reworked to fund via the ledger.

## 2026-08-30 — Coin Wallet v2, Phase 0 (cleanup)

- **`docs/specs/addendum-coin-wallet-v2.md`** Phase 0 (§15): removed the dead
  UPI top-up / payout scaffolding left behind when the rails themselves were
  cut in `a653cb8`. Dropped the `CoinTopUpRequest` and `CoinPayoutRequest`
  models and the `User.payoutUpiVpa` column (migration
  `20260830105645_drop_coin_topup_payout_and_upi_vpa`), the
  `/admin/wallet/topups` and `/admin/wallet/payouts` pages, and the
  `approve/rejectTopUpRequest` / `markPayoutPaid` / `rejectPayoutRequest`
  actions. `/admin/wallet` is now a thin shell pending v2 §13.3.
- Marked `addendum-coin-wallet.md` superseded; fixed stale `upi.ts` /
  top-up references in `schema.prisma` and the wallet API route comment.
- No behavior change — nothing created these rows anymore.

## 2026-08-27 — Docs

- Rewrote `docs/ROADMAP.md` as a vision doc **plus** a per-phase build-status ledger.
- Added `docs/foundations/MOBILE.md` (native app architecture + web-parity status).
- Added this `CHANGELOG.md`.
- Catch-up sweep of stale claims across the foundation docs (session management, 2FA, account deletion, feed pagination, `src/lib/search.ts`, monospace font, shadcn inventory, model count 148→163, Next.js 16.2→16.3). See `docs/foundations/DOCUMENTATION.md`'s Maintenance Rule.

## 2026-08-21 → 2026-08-27 — Mobile pro-upgrade M8–M14, upload hardening, `/download`

- **Mobile M8–M14** (`docs/specs/addendum-mobile-pro-upgrade.md`): reliability foundation (CI, Jest tests, Sentry), interaction polish, bearer-token SSE realtime (messages + presence), in-app-purchase compliance (engineering half), full settings/account parity with web (2FA, sessions, contact change), a stale-search-deferral closure, and live-testing fallout fixes (voice notes + file attachments in DMs).
- **Upload hardening:** uploaded file bytes are verified against their declared MIME type; `x-powered-by` header dropped.
- **`/download`:** redesigned into a standalone landing page serving the APK from Vercel Blob (not an expiring EAS link).
- **Post-deploy smoke test** (`scripts/smoke-test.mjs`) added to CI — guards against "bug" reports that are actually prod lagging a `git push`.
- **DB seed / cleanup scripts** added; EAS owner slug mismatch fixed.
- Bug-fix passes: upload MIME loss, notification-badge races, replay/presence/pagination bugs (mobile); stale bottom-nav badge and preview CSP error (web).

## 2026-08-19 → 2026-08-23 — World-class UI/UX pass, platform roles, global payouts

- **UI/UX pass:** design-system adoption across the app — `ConfirmButton` (~40 call sites), `EmptyState` (~80), `.stack`/`.row` layout utilities, live-site QA fixes.
- **Platform roles:** unified platform-admin + trust-safety staff into one `PlatformRole`; `/admin/businesses` approval page.
- **Stripe Connect:** payouts made global (were India-only); `identity.country` set correctly for Accounts v2; idempotency keys on all Checkout Session creation.
- **Perf:** batch sequential DB queries + Suspense-stream non-critical sections; fixed an unmemoized DB write on every auth check (slow buttons app-wide); mobile TTFB fix (stop re-seeding the OAuth scope catalog per request); disable prefetch on persistent nav links (503 bursts).
- **Desktop header search** added; env files reorganized (`.env.example`, secret-leak fix).
- Security: fixed critical security/payments gaps from a post-launch audit; CSP fix that had blanked the production site; several Dependabot bumps.

## 2026-08-19 → 2026-08-21 — Mobile app build-out

- **Native mobile app** (`mobile/`): PKCE-authenticated Expo client — home feed, notifications, profile/post navigation, then Phase A–C and Phase 15 work (offline caching, onboarding, tablet-responsive layout, write-path parity, rich profile/media).
- **Mobile pro-upgrade M1–M7:** Communities, Businesses, Marketplace, Events, Wallet, Messages, Search, Bookmarks — each with a matching `/api/v1` route built first.
- Mobile CI/release workflows; real push delivery via Expo's relay; OAuth refresh-token grant (closes a silent-logout gap).
- **Design pass:** mobile app moved onto the web app's own design-token system.

## 2026-08-12 → 2026-08-15 — Integrations go live, coin wallet

- **Stripe Connect** wired for real: creator payouts (tips, memberships, courses, digital products, offerings, tickets, marketplace, donations).
- **Stripe Billing** wired for real: premium profiles + business subscriptions (direct-to-platform SaaS charges).
- **Stripe Billing Meters** wired for real API-usage billing.
- **Resend** wired for real email delivery + the email notification channel; styled HTML templates for verify / reset / email-change.
- **Coin wallet** (`addendum-coin-wallet.md`): UPI top-up, coin-funded VIP, manual payout — later simplified to direct coin transfers.
- Account-settings hardening + platform-billing, custom-domains, and premium-profiles addenda built.
- Profile privacy fields enforced at DM-send, tag-on-post, and search/explore.

## 2026-08-06 → 2026-08-11 — Foundations, settings, landing redesign

- **Product docs:** vision, design system, information architecture, UX guidelines, bug tracker.
- **CI + test suite + DB backups + SEO routes**; Prisma switched to the libSQL adapter for the Turso-backed production DB; pending migrations wired into every production deploy.
- **Settings:** Android-Settings-style UI kit; every settings group reskinned onto shared card / danger-zone patterns.
- **Global keyboard shortcuts:** command palette, nav chords, list navigation.
- **Landing page** redesigned with marketing nav + live username-availability check; later iterated to the `MarketingNav` + `DigitalHomeVisual` hero.
- **Accent palette rebranded** from the Indian tricolor to Google's 4-color system (used semantically, not decoratively).
- Direct messaging, community chat, voice rooms, and livestream chat hardened; cross-posting to external social platforms.
- PWA install experience fixed for iOS/iPadOS/macOS Safari; media uploads routed to Vercel Blob.

## 2026-07-30 → 2026-08-06 — Phases 1–16

- **Phase 1 — Foundation:** identity, `@username` claiming, profile, link-in-bio with click analytics + scheduling, chronological feed, full-text search.
- **Phase 2 — Social:** follow/block, E2E-encrypted DMs + group chats with SSE, message requests, notifications, trending feed.
- **Phase 3 — Communities:** public/restricted/private, mod tools, wiki, live chat, voice rooms, polls, Q&A.
- **Phase 4 — Business:** business pages with a claim/verification gate, catalog + storefront, reviews, jobs board, appointments, document library.
- **Phase 5 — Creator:** processor-agnostic payments backbone, tips, memberships, digital downloads, courses, podcasts, newsletter, affiliate links, livestreams.
- **Phase 6 — Portfolio:** projects, skills, resume, git repos, credentials, awards.
- **Phase 7 — Knowledge:** articles, books, personal wiki, published files.
- **Phase 8 — Events:** business- or community-hosted events, RSVP, ticketing.
- **Phase 9 — Marketplace:** freelance services + a `MarketplaceListing` browse surface (shipped at `/m`, not `/store`).
- **Phase 10 — Developer platform:** `DeveloperApp` registration, scoped OAuth2/PKCE, bearer-authed REST API with rate limiting, HMAC-signed webhooks.
- **Phase 11 — AI platform:** `AIGeneration` audit substrate, moderation queue, content writer / profile builder, alt-text/captions, recommendations, AI-assisted search, translation — via a swappable provider seam.
- **Phase 12 — Trust & safety:** unified `TrustSafetyCase`, report center, appeals, spam/bot detection, age controls, transparency reporting.
- **Phase 13 — Copyright & IP:** version history, DMCA takedown/counter-notice, copyright declarations, watermarking, ownership records.
- **Phase 14 — Enterprise:** organizations, team management, internal communities, SAML2/OIDC SSO with JIT provisioning, employee directory, audit logs.
- **Phase 15 — Mobile/PWA:** PWA (manifest, service worker, install prompt), web push, IAP payout batching, digital business cards.
- **Phase 16 — Future modules:** triaged, not rebuilt — URL shortener, forms/surveys, lightweight CRM, and thin layers for notes/calendar/maps/donations/learning; cloud storage + video hosting deliberately not built.
- Post-Phase-1–4 review fixed 5 auth/UX bugs + 13 security/correctness issues.
