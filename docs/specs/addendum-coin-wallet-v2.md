# Addendum — Coin Wallet v2 (Platform Ecosystem Wallet)

Status: **Built** (2026-08-30) — all of §17's Phases 0–7 implemented; two
review-and-hardening passes since (see `CHANGELOG.md` 2026-08-30 /
2026-08-31). The double-entry ledger (`src/lib/wallet/`) is the sole source
of truth; `User.coinBalance` was dropped in Phase 6. Supersedes
[`addendum-coin-wallet.md`](addendum-coin-wallet.md), whose "Built" flows
(`upi.ts`, `CoinTopUpRequest`, `CoinPayoutRequest`, manual admin review)
were removed in commit `a653cb8` and never replaced.

Known deferrals (see `CHANGELOG.md` per-phase entries): dual-control
approval *queue* (`CoinGrantApproval`) — a hard ceiling is used instead;
PDF statement export (CSV ships); `/admin/wallet` account/business
inspector; refund-policy caller for `refundToWallet` (§18 #4, product
decision pending); affiliate attribution on coin purchases;
appointment-booking holds; `?ref=` on a profile URL (only `/join/<code>`).
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md),
[addendum-platform-billing.md](addendum-platform-billing.md),
[addendum-premium-profiles.md](addendum-premium-profiles.md),
[phase-5-creator-platform.md](phase-5-creator-platform.md)

**Product decisions locked (2026-08-30):** (1) peg is fixed `1 coin = 1 USD`;
(2) Premium is priced at its real `PLAN_PRICES` value in coins, no test
discount (§14); (3) launch promo is a time-boxed restricted grant (§8.1);
(4) referral rewards are **in scope** (§7.5); (5) **business wallets are in
scope** (§6.5). Remaining open items (§18): refund policy, membership
auto-renew from coins, and the future bank-rails addendum.

---

## 0. Why v2

The wallet today is a sealed box: coins enter only via a 1‑coin signup
bonus, and the only thing they buy is Premium Profile (hard‑coded to cost
1 coin in "test mode"). `coinBalance` is a bare mutable integer on `User`
with no transaction history. The top‑up / payout schema and admin screens
still exist but nothing creates a row. See the review that precedes this
doc for the full list of 17 findings.

v2 makes the coin wallet a **real, auditable, closed‑loop credit system
that works across the whole platform ecosystem** — tips, digital
products, courses, memberships, tickets, donations — with a proper ledger,
earning paths, holds/escrow, statements, API parity, and fraud controls.

**Bank rails stay out of scope** (see §3). No UPI/card top‑up, no cash‑out
payout, no FX, no KYC. Those return as a later addendum; v2's data model
is designed so re‑adding them is additive, not a rewrite.

---

## 1. Scope

### In scope

- Double‑entry **coin ledger** replacing `User.coinBalance`.
- Coins as a **payment method across every existing `PaymentTransaction`
  surface** (tips, digital products, courses, memberships, tickets,
  donations), sharing each feature's existing `activateXxx` row‑creation
  path.
- **Earning paths** that need no bank: audited signup grant, creator
  earnings (a creator paid in coins receives coins), refunds‑as‑coins,
  admin/promo grants, referral rewards.
- **Business wallets** (§6.5): a Business receives coin sales into its own
  balance and spends them on platform goods (its subscription, promoted
  listings).
- **Restricted vs spendable** balance buckets (promo/grant coins are
  non‑transferable and expirable), including a time‑boxed **launch promo**.
- **Holds / escrow** for async settlement (freelance bookings, capacity
  events, disputes).
- **Statements**: paginated ledger UI, CSV/PDF export, API parity.
- **Fraud controls**: reconciliation job, global invariant checks,
  per‑admin issuance caps, velocity limits, anomaly alerts.
- **Cleanup**: delete the dead top‑up/payout models, admin pages, and
  `User.payoutUpiVpa`; supersede the v1 addendum; fix stale comments.

### Non‑goals (explicit — do not build in v2)

- UPI / card / any external **top‑up**.
- Coin‑to‑cash **payout** to a bank / VPA.
- Moving coins from a **business wallet to a personal wallet** (or vice
  versa) — a payout‑shaped value transfer; deferred with the bank rails.
- USD↔INR or any **FX** conversion. Internal peg only (§4.1).
- **KYC / identity verification** for wallet holders.
- Reconciliation against a real bank statement; money‑transmitter
  licensing work.
- A coin **marketplace, secondary market, or variable exchange rate**.
  Prohibited by design (§3, `VISION.md`).

---

## 2. Findings → resolution map

| # | Finding | v2 resolution |
|---|---|---|
| 1 | No on‑ramp | Ecosystem earning paths (§7): audited signup grant, creator earnings, refunds‑as‑coins, promo/admin grants, referral rewards. Bank top‑up deferred with a clean seam (§3, §4.2). |
| 2 | Premium effectively free‑once | Remove `TEST_MODE_VIP_COIN_COST`; Premium costs its real `PLAN_PRICES` value in coins (§14). Launch promo handled as restricted, expiring grant (§8). |
| 3 | No off‑ramp | Deferred to bank‑rails addendum. `system_external_suspense` account + `payout` transaction kind reserved now so it's additive (§4.2). |
| 4 | `coinBalance` is not a ledger | Double‑entry `LedgerAccount` / `LedgerTransaction` / `LedgerPosting` (§4). Signup grant becomes an audited transaction. |
| 5 | Two disconnected economies | `chargeWallet()` writes a `PaymentTransaction` row (`processor: "wallet"`) and calls the same `activateXxx` as the Stripe webhook (§6). Refunds can settle as coins (§7.3). |
| 6 | Stale spec + orphaned schema/UI | Delete `CoinTopUpRequest`, `CoinPayoutRequest`, `/admin/wallet/topups`, `/admin/wallet/payouts`, `User.payoutUpiVpa`; supersede v1 addendum; fix `schema.prisma` comments (§15). |
| 7 | Receiving coins is silent | `notifyCoinsReceived` + delivery‑preference wiring (§12). |
| 8 | No recipient eligibility check | Transfer core rejects deactivated / suspended / blocking recipients with friendly errors; handles "recipient vanished mid‑tx" (§5.3). |
| 9 | Auth‑shape inconsistency | Rule: every mutation = pure `core(userId, params)` + web wrapper + API wrapper. Add `POST /api/v1/wallet/purchases` (§13). |
| 10 | `MAX_TRANSFER_COINS` duplicated | Single `src/lib/wallet/limits.ts` imported by action + route (§5.1). |
| 11 | Stale balance in error copy | Error text derives from the failed balance guard / a fresh read (§5.3). |
| 12 | Integer coins only | Store **integer minor units**, `1 coin = 100 units`; fractional pricing ($12.99 = 1299) supported (§4.1). |
| 13 | No pagination / export | Cursor‑paginated ledger + `/wallet/statement` CSV/PDF + `GET /api/v1/wallet/transactions` (§10, §13). |
| 14 | Triple‑currency muddle | Internal peg **1 coin = 1 USD**, fixed, closed‑loop. No INR anywhere in v2 (§4.1). |
| 15 | "Admin's word is the only fraud control" | Reconciliation cron + global sum‑zero invariant + per‑admin daily issuance cap + dual‑control threshold + anomaly alerts + velocity limits (§11). |
| 16 | Sybil faucet | Signup grant is **restricted** (non‑transferable, expiring) + account‑age / verification gates on transfer (§8, §11). |
| 17 | Crypto / speculation risk | §3 codifies closed‑loop, par‑value, non‑transferable‑for‑profit, no secondary market. |

---

## 3. Regulatory & product posture (read before designing anything)

A stored‑value instrument that can be **redeemed for third‑party goods or
services** (paying a creator) or **transferred between users** starts to
look like a prepaid payment instrument / money transmission (India PPI
rules, US state MTLs, EU e‑money). v2 deliberately stays in the
lightest‑touch design:

1. **Closed loop.** Coins are redeemable only for goods and services
   *on 0dot*, priced by 0dot. No cash‑out in v2.
2. **Par value, fixed.** 1 coin = 1 USD, always. Not a rate that moves.
   No market, no bid/ask, no appreciation.
3. **Not an asset.** No token‑gating, no NFT, no speculation
   (`VISION.md` non‑goal). Coins are account credit, nothing more.
4. **P2P transfer is the riskiest surface.** Keep per‑user caps low
   (§11), gate on account age + verification, and **flag creator↔creator
   value transfer at scale for legal review** before raising limits.
5. **Creator earnings accrue as coins** but a creator's real‑money payout
   still runs entirely through Stripe Connect / `CreatorPayoutAccount` —
   unchanged. Coins are a spending balance, not a settlement rail.

Everything below assumes this posture. Any change to it is a
product + legal decision, not an engineering one.

---

## 4. Data model — the coin ledger

### 4.1 Units & peg

- Amounts are **`Int` minor units**. `1 coin = 100 units`. `$12.99` of
  coin value = `1299` units. No floats in coin code (contrast the Stripe
  `Float` amounts, a documented SQLite deviation — the ledger does not
  inherit it).
- Peg is a compile‑time constant `COIN_UNIT = 100`, `USD_PER_COIN = 1`.
  There is no runtime rate and no second currency.
- All ledger math is integer; rounding rules (for a percentage platform
  fee on a coin charge) round the **fee** half‑up and the payee gets the
  remainder, so `payerDebit == payeeCredit + platformFee` exactly, every
  time.

### 4.2 Tables

```
LedgerAccount
  id            uuid pk
  type          enum: user_wallet            -- a user's spendable balance
                    | user_promo             -- a user's restricted (grant/promo) balance
                    | business_wallet        -- a business's spendable balance (§6.5)
                    | business_promo          -- a business's restricted balance
                    | system_platform_revenue-- platform's coin fee income
                    | system_promo_issuance  -- source of all granted/promo coins
                    | system_escrow          -- coins held pending capture/release
                    | system_refund_source   -- source of refund-as-coins credits
                    | system_external_suspense-- RESERVED for the future bank-rails phase; unused in v2
  ownerUserId   uuid? fk -> User      (set iff type in {user_wallet, user_promo})
  ownerBusinessId uuid? fk -> Business  (set iff type in {business_wallet, business_promo})
  cachedBalance int  default 0      -- optimization; source of truth is SUM(postings)
  createdAt     timestamp
  @@unique([type, ownerUserId])       -- one wallet + one promo per user
  @@unique([type, ownerBusinessId])   -- one wallet + one promo per business; system rows seeded once by migration (both owner cols null)

LedgerTransaction
  id             uuid pk
  kind           enum: signup_grant | promo_grant | admin_adjustment | referral_reward
                     | transfer | purchase | refund
                     | hold | hold_capture | hold_release
                     | promo_expiry | migration_opening
                     | payout            -- RESERVED for bank-rails phase; not emitted in v2
  idempotencyKey string unique        -- dedupes double-click / webhook redelivery / retry
  actorUserId    uuid? fk -> User      -- who initiated (null for system/cron)
  memo           string?
  relatedObjectType string?           -- tip | digital_product | course | membership_tier | ticket | fundraising_campaign | ...
  relatedObjectId   string?
  paymentTransactionId uuid? fk -> PaymentTransaction  -- set for kind in {purchase, refund}
  metadataJson   string default "{}"
  createdAt      timestamp
  @@index([kind, createdAt])

LedgerPosting
  id             uuid pk
  transactionId  uuid fk -> LedgerTransaction (onDelete: Restrict — ledger rows are never deleted)
  accountId      uuid fk -> LedgerAccount
  amount         int                  -- signed minor units; debit negative, credit positive
  createdAt      timestamp
  @@index([accountId, createdAt])
  @@index([transactionId])
```

**Invariants** (enforced in code at write time, re‑checked by the
reconciliation cron §11):

- Every `LedgerTransaction` has ≥ 2 postings and `SUM(posting.amount) == 0`.
- `LedgerAccount.cachedBalance == SUM(its postings.amount)`.
- `SUM(every posting in the system) == 0` (global).
- Every `user_wallet` / `user_promo` / `business_wallet` / `business_promo`
  `cachedBalance >= 0` always (no negative owner balances; system accounts
  may go negative, e.g. `system_promo_issuance` runs negative by design —
  it's the source).

### 4.3 Why double‑entry (not signed single‑entry)

The global `SUM(postings) == 0` check is the single most powerful
correctness guarantee available for a money system: any bug that
creates or destroys value shows up as a non‑zero global sum the
reconciliation job will alarm on within the hour. Signed single‑entry
gives you per‑account history but no way to notice "value appeared from
nowhere". The cost is one extra table and a sum check per write —
cheap.

### 4.4 `User.coinBalance`

Kept as a **read‑through mirror during migration** (§16), then dropped.
New code never reads it — it calls `getWalletBalance(userId)` which
returns `{ spendable, restricted, total }` from the ledger.

---

## 5. Core primitives — `src/lib/wallet/`

New module, thin actions on top. Every function takes an explicit
`userId` (never a page param) so web actions and API routes share it
(fixes #9).

```
src/lib/wallet/
  accounts.ts    ensureUserAccounts(userId) -> { walletId, promoId }
                 SYSTEM_ACCOUNTS (typed constants, created by migration seed)
  ledger.ts      postTransaction(tx, { kind, idempotencyKey, actorUserId, postings[], ... })
                   - asserts postings sum to zero
                   - updates every touched account's cachedBalance in the same tx
                   - the >= 0 guard on user accounts lives here (updateMany where cachedBalance >= n)
                   - returns the created LedgerTransaction, or the existing one on idempotency hit
                 getWalletBalance(userId) -> { spendable, restricted, total }
                 listTransactions(userId, { cursor, kind?, limit }) -> cursor page
  charge.ts      chargeWallet({ payerId, payeeUserId?, payeeBusinessId?, amount, kind,
                                relatedObjectType, relatedObjectId, idempotencyKey })
                   -> { paymentTransactionId } | { error }
                 refundToWallet({ paymentTransactionId, amount, reason })  -- §7.3
  holds.ts       placeHold(...) / captureHold(...) / releaseHold(...)      -- §Holds
  grants.ts      issueSignupGrant(userId)          -- called from auth.ts signup
                 issuePromoGrant({ userId, amount, reason, expiresAt })
                 adminAdjust({ adminId, userId, amount, reason })          -- §11 caps apply
  limits.ts      WALLET_LIMITS  (single source; imported by action + API route)
                 checkTransferEligibility(fromUserId, toUserId) -> ok | reason
                 checkVelocity(userId, kind)
  reconcile.ts   runWalletReconciliationOnce()      -- cron job, §11
  expiry.ts      runPromoExpirySweepOnce()          -- cron job, §8
```

### 5.1 `WALLET_LIMITS` (starting values — product/finance to confirm)

```ts
export const WALLET_LIMITS = {
  COIN_UNIT: 100,

  SIGNUP_GRANT_COINS: 1,               // ongoing policy; restricted + expiring
  SIGNUP_GRANT_TTL_DAYS: 90,

  // Launch promo (§8.1) — one free month of Premium for early accounts.
  LAUNCH_PROMO_COINS: 6,               // = one month of profile_premium
  LAUNCH_PROMO_TTL_DAYS: 90,
  LAUNCH_PROMO_ENDS_AT: "<v2 ship date + 90d, ISO>",  // env-overridable

  // Referral rewards (§7.5) — paid only after the invitee verifies + acts.
  REFERRAL_REWARD_INVITER_COINS: 3,
  REFERRAL_REWARD_INVITEE_COINS: 3,
  REFERRAL_REWARD_TTL_DAYS: 90,
  REFERRAL_MAX_REWARDED_INVITES_PER_INVITER: 25,   // anti-farm ceiling

  TRANSFER_MIN_COINS: 1,
  TRANSFER_MAX_COINS_PER_TX: 20,
  TRANSFER_MAX_COINS_PER_DAY: 100,
  TRANSFER_MAX_RECIPIENTS_PER_DAY: 10,
  TRANSFER_MIN_ACCOUNT_AGE_HOURS: 24,  // fixes #16

  ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY: 5_000,
  ADMIN_ADJUST_DUAL_CONTROL_THRESHOLD_COINS: 1_000,

  // Business wallets (§6.5) — spend-only on platform goods, no P2P.
  BUSINESS_SPEND_ROLES: ["owner", "admin"],   // who may spend a business wallet
} as const;
```

All coin figures here are **whole coins**; multiply by `COIN_UNIT` for
minor units. Referral and launch‑promo grants land in the **promo**
(restricted) bucket.

### 5.2 Transfer (rewrite of `transferCoinsAction`)

`transferCoins({ fromUserId, toHandle, coins, idempotencyKey })`:

1. Resolve recipient by handle. Reject self, unknown handle.
2. `checkTransferEligibility` — recipient must be a live account
   (not deactivated, not suspended/banned), and there must be no block
   in either direction. Account‑age + verification gate on the **sender**.
3. `checkVelocity` — per‑day coins and per‑day distinct recipients.
4. `postTransaction(kind: "transfer")` with postings
   `[-coins @ sender.user_wallet, +coins @ recipient.user_wallet]`,
   guarded on `sender.user_wallet.cachedBalance >= coins`.
   **`user_promo` is never a transfer source** (fixes #16).
5. `notifyCoinsReceived`.

### 5.3 Correctness details (fix #8, #11)

- The `>= 0` balance guard is a single `updateMany({ where: { id,
  cachedBalance: { gte: n } } })` inside the `$transaction`; `count === 0`
  ⇒ insufficient funds, roll back, return the error built from a **fresh**
  `getWalletBalance` read (not a stale pre‑tx value).
- Recipient deleted between lookup and posting ⇒ the FK insert throws,
  the whole `$transaction` rolls back, and the caller returns
  `"That account is no longer available."` rather than a 500.
- libSQL is single‑writer; `$transaction` + the balance guard is
  sufficient for race‑safety (same posture the codebase already relies on
  — there is a passing overdraft‑race test to port).

---

## 6. Coins as a payment method

### 6.1 The bridge to `PaymentTransaction`

`chargeWallet()` runs one `$transaction` that does **all** of:

1. `postTransaction(kind: "purchase")` — debit payer (promo bucket first,
   then wallet bucket), credit payee `user_wallet`, credit
   `system_platform_revenue` with the fee. Postings sum to zero.
2. `recordPaymentTransaction(tx, { ..., processor: "wallet",
   processorReference: ledgerTxn.id, status: "succeeded" })` — so the
   existing money‑movement ledger, analytics, and admin views see the
   coin sale exactly like a Stripe sale.
3. Returns `{ paymentTransactionId }`.

Schema change: add `"wallet"` to `PaymentTransaction.processor`
(`stripe_connect | apple_iap | google_play_billing | wallet`). `storeFee`
stays null. `platformFee` uses `resolveFeeRate` unchanged (premium
creators keep their reduced rate).

### 6.2 Sharing each feature's `activateXxx`

Today `activateTip` / `activateMembershipSubscription` / etc. are called
**only** by the Stripe webhook and take `(metadata, processorReference)`.
Refactor each to take a **settlement object**:

```ts
type Settlement = {
  paymentTransactionId: string;   // already created by caller
  payerId: string;
  payeeId?: string | null;
  payeeBusinessId?: string | null;
  amount: number;                 // in the feature's native currency (USD)
  currency: string;
  metadata: Record<string, string>;
};
```

- Stripe webhook: builds `Settlement` after `recordPaymentTransaction`,
  then calls `activateXxx(settlement)`.
- Coin path: feature action calls `chargeWallet(...)`, gets
  `{ paymentTransactionId }`, builds `Settlement`, calls the **same**
  `activateXxx(settlement)`.

Feature‑row creation (the `Tip` / `MembershipSubscription` / `Enrollment`
row) lives in one place, reached by both rails. No duplication (the thing
the review flagged as the real risk).

### 6.3 Per‑feature rollout

| Feature | Coin path | Notes |
|---|---|---|
| Tips | synchronous `chargeWallet` | simplest; do first |
| Donations (fundraisers) | synchronous | same shape as tips |
| Digital products | synchronous | issue download grant in `activateXxx` |
| Courses / learning paths | synchronous | enrollment in `activateXxx` |
| Event tickets | `placeHold` → `captureHold` on issue | capacity race handled by hold |
| Memberships (recurring) | **coins pay the first period only**; renewal needs a fresh coin charge (mirrors the coin‑Premium model) — no coin "mandate" | flag: auto‑renew‑from‑coins is a later decision |
| Premium Profile | already coin‑funded; switch to real price (§14) | |
| Marketplace listings, freelance bookings | phase 3 | freelance uses holds |

Each feature action gains a `payWith: "card" | "coins"` branch. Card
branch unchanged (redirect to Stripe). Coin branch: `chargeWallet` then
`activateXxx` then redirect back with `?paid=coins`.

### 6.4 Payee eligibility

A creator can **receive** coins with no payout account (coins land in
their wallet, usable on‑platform). The `payoutAccount.status === "active"`
gate that tips/donations enforce today applies **only to the card rail**
(where money must reach a bank). Document this split clearly in each
feature file.

When the payee is a **business** (`payeeBusinessId` set — store sales,
business‑hosted ticketed events, business fundraisers), the credit lands
in that business's `business_wallet` (§6.5), not an individual's.

### 6.5 Business wallets

Each `Business` gets a `business_wallet` + `business_promo` account pair,
created lazily by `ensureBusinessAccounts(businessId)` on first credit or
first visit to the wallet screen.

- **Funding (in):** any coin sale where the business is the payee — its
  Store catalog, business‑hosted paid tickets, business fundraisers —
  credits `business_wallet` in the same `chargeWallet` transaction as the
  buyer's debit. Admin/promo grants can target a business too.
- **Spending (out):** on platform goods the business buys from 0dot — its
  **business subscription** (the custom‑domain / business‑plan billing,
  mirroring the coin‑Premium rail), **promoted marketplace listings**, and
  any future paid business surface. Same `chargeWallet` primitive with
  `payeeBusinessId: null` / platform as payee.
- **Who may spend:** `Business` role `owner` or `admin` only
  (`WALLET_LIMITS.BUSINESS_SPEND_ROLES`), enforced by the existing
  business‑role guard. `editor` / `member` can view the balance and
  statement but not spend.
- **No P2P, no cross‑wallet:** a `business_wallet` is never a `transfer`
  source or destination, and coins cannot move between a business wallet
  and a personal wallet in v2 (that's a payout‑shaped transfer — deferred,
  §1 non‑goals). This keeps businesses strictly a closed spender of what
  they earn.
- **Restricted bucket:** `business_promo` works exactly like `user_promo`
  (grants, expiry, drawn first on spend).
- **Surfaces:** a Wallet tab in the business settings area
  (`/b/[slug]/…` settings), balance + paginated statement + CSV export,
  and the business appears in the admin account inspector (§13.3).

---

## 7. Earning paths (the on‑ramp, minus banks)

### 7.1 Signup grant (audited — fixes #4)

`issueSignupGrant(userId)` from `auth.ts` signup, inside the user‑creation
transaction: `postTransaction(kind: "signup_grant")`, postings
`[-N @ system_promo_issuance, +N @ user.user_promo]`, with an
`idempotencyKey` of `signup_grant:${userId}` (exactly once, ever).
Restricted bucket + `expiresAt = now + SIGNUP_GRANT_TTL_DAYS` (§8).

### 7.2 Creator earnings

Falls out of §6 for free: when someone pays a creator in coins, the
creator's `user_wallet` is credited in the same transaction. Nothing else
to build.

### 7.3 Refunds as coins (bridge — fixes #5)

`refundToWallet({ paymentTransactionId, amount, reason })`:
`postTransaction(kind: "refund")`, postings
`[-amount @ system_refund_source, +amount @ user.user_wallet]`, and
`recordPaymentTransaction(processor: "wallet", kind: "<original>_refund"…)`
or flip the original row's `status` to `refunded` per existing
convention. Used when:

- A Stripe purchase is refunded and product policy is "credit, don't
  reverse the card".
- A creator/admin issues goodwill credit.
- A coin purchase is refunded (reverses the original `purchase`
  postings).

### 7.4 Admin / promo grants (fixes #15 partly)

`issuePromoGrant` (campaigns, launch bonus) and `adminAdjust` (support
goodwill, corrections). Both:

- `kind: "promo_grant"` / `"admin_adjustment"`, `actorUserId` set,
  `memo` required.
- Draw from `system_promo_issuance`.
- Subject to `ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY` and, above
  `ADMIN_ADJUST_DUAL_CONTROL_THRESHOLD_COINS`, a second admin's approval
  (reuse the two‑reviewer pattern from trust‑safety appeals).
- Surfaced in a new **admin wallet audit view** (§13).

### 7.5 Referral rewards (in scope)

Distinct from the affiliate‑commission system (which pays a % on sales an
affiliate link drives). This rewards *bringing a new person onto the
platform*.

**Attribution**
- A signed‑in user shares a referral link `0dot.in/join/<code>` (or their
  existing `0dot.in/<handle>` with a `?ref` param). `code` maps to the
  inviter — new lightweight `ReferralCode { userId, code }` (one per user,
  minted on first use).
- The landing route sets a first‑party, `httpOnly`, 30‑day cookie
  `ref=<code>` (same no‑IP/UA posture as `/aff/[code]` and `/r/[linkId]`).
- At **signup**, if a valid `ref` cookie is present and the code's owner
  isn't the new user, write `User.referredByUserId` (nullable FK, new
  column) once, immutably.

**Payout — earned, not automatic**
- Rewards are issued only when the invitee **verifies their email _and_
  completes one meaningful action** (claims a username + one of: publishes
  a post, adds a link, or makes any purchase) — enough friction that a
  throw‑away account earns nothing.
- On that trigger: one `LedgerTransaction(kind: "referral_reward")` with
  postings crediting **both** parties' `*_promo` accounts from
  `system_promo_issuance`
  (`REFERRAL_REWARD_INVITER_COINS` / `REFERRAL_REWARD_INVITEE_COINS`),
  restricted, `REFERRAL_REWARD_TTL_DAYS` expiry.
  `idempotencyKey = referral_reward:${inviteeUserId}` — pays exactly once.
- `notifyCoinsReceived` to both (`reason: "referral"`).

**Anti‑abuse**
- `REFERRAL_MAX_REWARDED_INVITES_PER_INVITER` lifetime cap.
- Inviter must be email‑verified and past `TRANSFER_MIN_ACCOUNT_AGE_HOURS`.
- The invitee‑action gate + the sybil signals in §11.4 (many new accounts
  → one inviter) are the primary controls; flag runaway referral issuance
  for review, don't auto‑block in v2.
- Self‑referral (same device/email/phone heuristics already used at
  signup) earns nothing.

---

## 8. Restricted vs spendable buckets (fixes #16, enables promos)

- Each user has `user_wallet` (spendable) **and** `user_promo`
  (restricted); each business likewise (`business_wallet` /
  `business_promo`).
- `*_promo` coins: **spendable on platform goods/services, never
  transferable, may expire.**
- `chargeWallet` draws the `*_promo` bucket first, then the spendable
  bucket (two guarded debits, or one combined posting set).
- **Expiry**: a grant `LedgerTransaction` (`signup_grant`, `promo_grant`,
  `referral_reward`) carries `metadataJson.expiresAt`.
  `runPromoExpirySweepOnce()` (hourly cron) finds expired, unspent grant
  value per account and posts `kind: "promo_expiry"` reversing the unspent
  remainder back to `system_promo_issuance`. Spent‑down grants expire to
  zero — no clawback of already‑used value. FIFO: earliest‑expiring grant
  is consumed first when charging.
- `getWalletBalance` returns both buckets so the UI can show
  "12 coins (6 expiring Nov 3)".

### 8.1 Launch promo (fixes #2's reachability gap)

Removing the test‑mode discount means Premium costs a real 6 coins/month —
unreachable with only the 1‑coin signup grant and no bank on‑ramp. The
launch promo bridges that for early adopters without becoming a permanent
free‑Premium side effect:

- Every account created **before `LAUNCH_PROMO_ENDS_AT`** gets, in the
  same signup transaction as the base grant, a second
  `LedgerTransaction(kind: "promo_grant", memo: "launch")` of
  `LAUNCH_PROMO_COINS` (6 = one month of Premium) into `user_promo`,
  `LAUNCH_PROMO_TTL_DAYS` expiry, `idempotencyKey = launch_promo:${userId}`.
- After the window closes, new accounts get only the 1‑coin base grant;
  reaching Premium then requires earning coins (referrals, being tipped,
  selling) — which is the intended behavior, and the reason the earning
  paths ship in the same release.
- `LAUNCH_PROMO_ENDS_AT` is env‑overridable so product can extend or cut
  the window without a deploy.
- Cost is bounded and visible: `system_promo_issuance` balance ×
  `USD_PER_COIN` is the outstanding promo liability, on the admin
  overview (§13.3).

---

## 9. Holds & escrow

For anything that isn't "pay now, done now":

- `placeHold({ payerId, amount, relatedObjectType, relatedObjectId,
  expiresAt })` → `kind: "hold"`, postings
  `[-amount @ payer wallet/promo, +amount @ system_escrow]`, plus a
  `LedgerHold` row `{ transactionId, state: "pending", expiresAt }`.
- `captureHold(holdId, { payeeUserId })` → `kind: "hold_capture"`,
  `system_escrow → payee wallet` + fee, `LedgerHold.state = "captured"`,
  and the settlement/`activateXxx` call.
- `releaseHold(holdId)` → `kind: "hold_release"`, `system_escrow → payer`,
  `state = "released"`.
- A cron releases holds past `expiresAt` still `pending`.

Consumers: event tickets (hold on checkout, capture on issue — kills the
capacity race), freelance bookings (hold on request, capture on
confirm, release on decline), disputes (hold instead of capture pending
resolution).

---

## 10. Statements & history (fixes #13)

- `listTransactions(userId, { cursor, kind?, limit })` — cursor‑paginated
  (`(createdAt, id)` tuple, same convention as `Notification`).
- Each row resolves to a human line: "Tip to @jane", "Refund — course X",
  "Received from @bob", "Signup bonus", "Promo — launch", "Expired —
  unused signup bonus".
- **Statement export**: `GET /wallet/statement?from=&to=&format=csv|pdf`
  — a server route that streams the file (never a client‑side download;
  respects the platform's download conventions). CSV columns: date, kind,
  counterparty, memo, amount (coins), running balance.

---

## 11. Fraud, limits & reconciliation (fixes #15, #16)

### 11.1 Reconciliation cron (`runWalletReconciliationOnce`, hourly bucket)

- Recompute `cachedBalance` for every account from `SUM(postings)`;
  alarm + auto‑heal on drift.
- Assert global `SUM(all postings) == 0`; **page on failure** (this means
  value was created or destroyed).
- Assert every `LedgerTransaction` is internally balanced.
- Assert no `user_wallet` / `user_promo` is negative.
- Emit metrics: total coins outstanding, coins issued today, coins
  spent today, `system_platform_revenue` balance.

### 11.2 Velocity & eligibility

- Per‑user per‑day: coins transferred, distinct recipients, purchases —
  all in `limits.ts`, checked via the existing `rate-limit` counter
  table.
- Transfer sender gate: email‑verified **and**
  `account_age >= TRANSFER_MIN_ACCOUNT_AGE_HOURS`.
- Recipient gate: live account, no block either direction.

### 11.3 Admin issuance controls

- `ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY` hard cap.
- `> DUAL_CONTROL_THRESHOLD` ⇒ second‑admin approval (new
  `CoinGrantApproval` row, or reuse trust‑safety's two‑reviewer helper).
- Every `admin_adjustment` / `promo_grant` in an **audit view** with
  actor, amount, reason, timestamp — filterable, exportable.

### 11.4 Anomaly alerts

Daily job flags: issuance spike vs trailing 7‑day mean, a single account
receiving from many new accounts (sybil cash‑out pattern), a single admin
near their daily cap. Alerts to the ops channel — no automated blocking
in v2.

---

## 12. Notifications (fixes #7)

- New `Notification.type = "coins_received"`, `subjectType = "user"`,
  `subjectId = actorId` (or a system sentinel for grants).
- `notifyCoinsReceived({ recipientId, actorId?, amount, reason })` in
  `src/lib/notifications.ts`, following the existing `notifyTipReceived`
  shape (bypasses the self‑notification guard only for system grants).
- Fires on: transfer received, creator earning, refund‑to‑wallet, promo /
  admin grant, referral reward.
- Respects `NotificationDeliveryPreference` (in‑app / push / email) like
  every other type. Push copy is generic per the platform's
  private‑content rule ("You received coins").

---

## 13. Surfaces

### 13.1 `/wallet` (rewrite)

- Balance card: total, with a "X restricted, expiring <date>" note.
- **Spend**: Premium purchase (real price now), plus a "coins accepted"
  affordance is surfaced on the feature pages themselves, not here.
- **Send coins**: unchanged form, now with the eligibility errors.
- **Invite & earn**: the referral link + "N of M invites rewarded" (§7.5).
- **Activity**: cursor‑paginated ledger, kind filter, "Download
  statement".

### 13.2 Business wallet (`/b/[slug]` settings → Wallet)

- Balance + restricted note, visible to any business team member.
- Spend actions (business subscription, promoted listings) — owner/admin
  only.
- Paginated statement + CSV export.

### 13.3 Admin — `/admin/wallet` (repurpose)

Delete `topups/` and `payouts/` sub‑pages. New:

- **Overview**: coins outstanding, **outstanding promo liability**
  (`system_promo_issuance` balance), issued/spent today,
  `system_platform_revenue` balance, last reconciliation result.
- **Issuance audit**: every grant / adjustment / referral reward,
  filterable, exportable.
- **Grant tool**: `adminAdjust` / `issuePromoGrant` with caps + dual
  control; target a user or a business.
- **Account inspector**: look up a user *or business*, see the full
  ledger, place a manual correction (audited).

### 13.4 API (fixes #9, #13)

| Route | Scope | Notes |
|---|---|---|
| `GET /api/v1/wallet` | `payments:read` | balance `{ spendable, restricted, total }` + recent entries (keep `history` key as an alias for one release) |
| `GET /api/v1/wallet/transactions` | `payments:read` | cursor‑paginated ledger |
| `POST /api/v1/wallet/transfer` | `payments:write` | already exists; move cap to shared `limits.ts`, add eligibility checks, require `idempotencyKey` in body |
| `POST /api/v1/wallet/purchases` | `payments:write` | **new** — pay for a feature with coins from the API; body `{ target: "premium" | "tip" | ..., ...params, idempotencyKey }`; wraps the same core as the web action (closes the auth‑shape gap) |
| `GET /api/v1/wallet?scope=business&businessId=` | `payments:read` | **new** — a business wallet the caller is owner/admin of (§6.5) |
| `GET /api/v1/wallet/referral` | `payments:read` | **new** — the caller's referral code + count of rewarded invites |

All wallet mutation routes: `requireVerifiedApiUser`, per‑app rate limit,
body `idempotencyKey` echoed and honored.

---

## 14. Premium pricing decision (fixes #2)

**Decided (2026-08-30): real price, no discount.**

- Remove `TEST_MODE_VIP_COIN_COST` entirely.
- `profile_premium` costs its real `PLAN_PRICES` value **in coins**,
  whichever rail pays: `$6/mo → 6 coins → 600 units`,
  `$60/yr → 60 coins → 6000 units`. 1 coin = $1 holds everywhere, no
  special "coin price".
- `purchaseProfilePremiumWithCoins` is reimplemented on `chargeWallet({
  kind: "purchase", payeeUserId: null, payeeBusinessId: null,
  relatedObjectType: "platform_subscription", amount: priceFor(plan,
  interval) })` — platform is the payee, so `platformFee == amount` (the
  existing "no external payee" convention in `recordPaymentTransaction`).
- The coin‑funded `PlatformSubscription` mechanics are unchanged: the
  `coin:` `processorSubscriptionId` marker, renewal by extending
  `currentPeriodEnd`, and the `expireLapsedCoinSubscriptions` sweep all
  stay exactly as they are today.
- Reachability while there's no bank on‑ramp is handled by the **launch
  promo** (§8.1) plus the earning paths, not by a permanent discount.
- The **business subscription** (custom‑domain / business plan) gets the
  same coin rail, paid from `business_wallet` (§6.5).

The Stripe **card rail stays off** for now (its current state); coins are
the only Premium rail in v2. Turning the card rail back on is a separate,
independent decision and does not block this plan.

---

## 15. Cleanup (fixes #6) — do this first, it's the smallest PR

- Delete models `CoinTopUpRequest`, `CoinPayoutRequest` + their migration
  (new migration dropping the tables).
- Delete `src/app/admin/wallet/topups/`, `src/app/admin/wallet/payouts/`,
  and the `approveTopUpRequest` / `rejectTopUpRequest` / `markPayoutPaid`
  / `rejectPayoutRequest` actions.
- Delete `User.payoutUpiVpa`.
- Update `/admin/wallet` + `/admin` section list (drop the "top‑up and
  payout requests" copy).
- Fix `schema.prisma` comments on `User.coinBalance` (remove the
  `USD_COIN_TO_INR_RATE in upi.ts` reference) and any other `upi.ts`
  mentions.
- Add a one‑line header to `addendum-coin-wallet.md`:
  `> SUPERSEDED by addendum-coin-wallet-v2.md (2026-08-30).`
- `CHANGELOG.md` entry.

---

## 16. Migration plan (phased, mirror‑then‑cut)

1. **Add ledger tables** (`LedgerAccount`, `LedgerTransaction`,
   `LedgerPosting`, `LedgerHold`). Seed `system_*` accounts in the
   migration.
2. **Backfill**: for every user, `ensureUserAccounts`. For every user with
   `coinBalance > 0`, post `kind: "migration_opening"`:
   `[-balance @ system_promo_issuance, +balance @ user.user_promo]`
   (existing balances become restricted — they were all signup bonuses).
   Verify global sum == 0 before the migration commits.
3. **Dual‑write** (one release): `issueSignupGrant`, transfers, and
   Premium purchase write **both** the ledger and `User.coinBalance`.
   Reads still come from `coinBalance`. Reconciliation cron runs and must
   stay green.
4. **Cut reads over** to `getWalletBalance`. `coinBalance` still
   dual‑written as a safety mirror.
5. **Drop** `User.coinBalance` + the dual‑write. Ledger is now sole
   source of truth.
6. **Cleanup PR** (§15) can land any time after step 1.

---

## 17. Suggested build sequence

Each phase is independently shippable and leaves the app working.

- **Phase 0 — Cleanup** (§15). Delete dead top‑up/payout. No behavior
  change. ~1 PR.
- **Phase 1 — Ledger core.** Tables, `src/lib/wallet/{accounts,ledger}.ts`,
  migration + backfill (§16 steps 1–2), reconciliation cron (§11.1),
  dual‑write + read‑cutover for the *existing* flows (signup grant,
  transfer, coin‑Premium). `getWalletBalance` everywhere. Restricted /
  spendable buckets + promo expiry (§8). Tests: port the overdraft‑race
  test, add sum‑zero property tests.
  *Acceptance:* balances identical before/after; reconciliation green;
  signup grant now has a `LedgerTransaction`; transfers can't spend the
  promo bucket.
- **Phase 2 — Coins as payment.** `chargeWallet` + `PaymentTransaction`
  bridge (§6.1), `processor: "wallet"`, the `Settlement` refactor of
  `activateXxx` (§6.2), then wire **tips + donations + digital products +
  courses** coin paths. `notifyCoinsReceived` (§12). Refund‑to‑wallet
  (§7.3).
  *Acceptance:* a coin‑paid tip produces one `PaymentTransaction`
  (`processor: "wallet"`), one balanced `LedgerTransaction`, one `Tip`
  row, one notification — via the same `activateTip` the webhook uses.
- **Phase 3 — Holds + async features.** `LedgerHold`, `placeHold` /
  `captureHold` / `releaseHold`, expiry cron. Wire **event tickets** and
  **freelance bookings**. Memberships first‑period coin payment.
- **Phase 4 — Business wallets** (§6.5). `business_wallet` / `business_promo`
  accounts + `ensureBusinessAccounts`, business as coin payee (Store,
  business‑hosted tickets/fundraisers), business subscription paid in
  coins, owner/admin spend guard, business Wallet settings tab.
  *Acceptance:* a coin Store purchase credits the business wallet; an
  editor can view but not spend; global sum stays zero.
- **Phase 5 — Surfaces + API.** `/wallet` rewrite (statements, pagination,
  invite‑&‑earn), `/wallet/statement` export, `/admin/wallet` rewrite
  (overview + promo liability, issuance audit, grant tool with caps + dual
  control, account/business inspector), `GET /api/v1/wallet/transactions`,
  `POST /api/v1/wallet/purchases`, business + referral read routes,
  transfer route hardening (§13.4).
- **Phase 6 — Premium pricing + launch promo.** Remove
  `TEST_MODE_VIP_COIN_COST`, real coin price (§14), launch‑promo grant in
  the signup transaction (§8.1). Anomaly alerts (§11.4).
  `User.coinBalance` drop (§16 step 5).
- **Phase 7 — Referral rewards** (§7.5). `ReferralCode`,
  `User.referredByUserId`, `/join/<code>` landing + cookie, the
  verify‑plus‑action trigger, dual‑party grant, anti‑abuse caps.

---

## 18. Open questions for product / finance / legal

**Resolved 2026-08-30** (see the header): peg is fixed 1:1; Premium at real
coin price, no discount; launch promo as §8.1; referral rewards in;
business wallets in.

Still open:

1. **Launch promo tuning** (§8.1 / §5.1) — `LAUNCH_PROMO_COINS = 6`,
   90‑day TTL, all new accounts before `LAUNCH_PROMO_ENDS_AT`. Confirm the
   amount, the window length, and whether it's truly all accounts or
   capped at first N. Numbers are placeholders until finance signs off.
2. **Referral reward amounts** (§7.5 / §5.1) — `3 + 3` coins, lifetime cap
   25, and the exact "meaningful action" that triggers payout.
3. **P2P transfer limits** (§5.1) — the caps are abuse‑resistance guesses.
   Legal sign‑off needed before raising them or before creator↔creator
   transfer volume grows (§3.4).
4. **Refund policy** — when is a refund credited as coins vs reversed to
   the card? Per‑feature or global default?
5. **Membership renewal from coins** — allowed as a standing behavior, or
   coins pay the first period only (current plan)?
6. **Business → personal coin movement** — deferred (§1 non‑goals). Revisit
   with the bank‑rails addendum, since it's the same payout‑shaped risk.
7. **Bank rails** — when top‑up / cash‑out returns, its own addendum:
   FX source, KYC, PPI/MTL licensing, reconciliation against real
   settlement. `system_external_suspense` and the `payout` transaction
   kind are the reserved seams.
