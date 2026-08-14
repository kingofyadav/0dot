# Addendum — Coin Wallet & UPI Top-Up

Status: Built (2026-08-14) — §2 wallet primitive, §3 UPI top-up/review flow,
§4 coin-funded Premium purchase, and §5 manual payout execution all
implemented per this spec.
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md), [addendum-platform-billing.md](addendum-platform-billing.md),
[addendum-premium-profiles.md](addendum-premium-profiles.md),
[phase-1-foundation.md](phase-1-foundation.md), [phase-5-creator-platform.md](phase-5-creator-platform.md)

## 1. Why this exists outside the normal spec-first flow

Every other payment surface in this codebase (`payments.ts`'s Stripe Connect,
`platform-billing.ts`'s Stripe Billing) was built against a phase spec or
addendum written first. This feature — a coin wallet funded by manually
reviewed UPI transfers, spent on Premium Profile — was built directly, with
no spec preceding it. This document records the design after the fact so
the next reader (human or agent) doesn't have to reconstruct intent from
code comments alone, and so the repo's "read the spec, then build"
convention has something to point to here too.

The reason to build a second, parallel on-ramp to `PlatformSubscription` at
all: Stripe Checkout requires a card and international billing, which is a
real adoption barrier for a UPI-first user base. Coins are a cash-first
alternative rail into the exact same `profile_premium` product, not a
separate product.

## 2. The wallet primitive

```
User gains:
  coin_balance      int, default 0
  payout_upi_vpa    string, nullable
```

`coinBalance` is a plain integer balance on `User`, deliberately **not**
modeled as a ledger of individual transactions (contrast
`PaymentTransaction`, which is an append-only ledger by design) — the two
mutation sites (`approveTopUpRequest` crediting, `purchaseProfilePremiumWithCoins`
debiting) are both already wrapped in a `db.$transaction` alongside the row
that justifies the mutation, so the balance can't drift from what actually
happened without also corrupting the transaction/subscription state next to
it. Every new account starts with a 1-coin signup bonus
(`src/app/actions/auth.ts`).

`payoutUpiVpa` only records where a *future* coin-to-cash payout would go —
see §5.

1 coin = $1 always. This is a fixed peg, not a rate that moves — coins are
priced in the same PLAN_PRICES numbers (`platform-billing.ts`) Stripe
Checkout charges in dollars, so a plan costs the same number of coins as it
costs dollars.

## 3. UPI top-up flow

```
CoinTopUpRequest
  id                    uuid, pk
  user_id               uuid, fk -> User
  coin_amount           int
  amount_inr            int          -- computed once at creation via coinsToInr, never re-derived
  reference_code        string, unique  -- embedded in the UPI deep link's "tn" note, and in the QR
  status                enum: pending_payment | submitted | approved | rejected
  utr                   string, nullable  -- the payer's proof, typed in by hand
  submitted_at           timestamp, nullable
  reviewed_at            timestamp, nullable
  reviewed_by_user_id     uuid, fk -> User, nullable
  review_note            string, nullable
  created_at             timestamp
```

There is no payment gateway in this build. The flow is entirely manual,
trust-based verification:

1. User picks a coin amount (`MIN_TOPUP_COINS`–`MAX_TOPUP_COINS`, 10–1,000,
   an abuse-resistance ceiling, not a spec requirement — same posture as
   `tips.ts`'s `MAX_TIP_AMOUNT`), and a row is created up front so a stable
   `referenceCode` exists before the user ever leaves the app
   (`createTopUpRequest`, `src/app/actions/wallet.ts`).
2. The user pays via any UPI app, scanning a QR (`buildUpiDeepLink` +
   `renderUpiQrSvg`, `src/lib/upi.ts`) that encodes the platform's own VPA
   (`PLATFORM_UPI_VPA`/`PLATFORM_UPI_PAYEE_NAME` env vars), the INR amount,
   and the reference code as the payment note.
3. The user types in the UTR their UPI app gave them as a receipt
   (`submitTopUpUtr`) — this is the entire "proof" in this flow.
4. A platform admin manually cross-checks that UTR against the platform's
   own bank/UPI statement outside the app (`/admin/wallet/topups`), then
   approves or rejects (`approveTopUpRequest`/`rejectTopUpRequest`). Approval
   credits `coinBalance` and flips status in the same transaction, gated on
   an atomic `status: "submitted"` claim so a double-click or two
   concurrent admins can't double-credit.

This is a real ledger-adjacent decision the spec should name plainly: **an
admin's word is the only fraud control here.** There's no automated
reconciliation against the bank statement, no per-admin approval limit, no
anomaly detection on approval volume. Acceptable at current volume; worth
revisiting before this scales past a small admin team's ability to eyeball
every UTR by hand.

### 3.1 The INR peg

```ts
export const USD_COIN_TO_INR_RATE = 90; // src/lib/upi.ts
```

A hardcoded placeholder, explicitly not a finance decision that's been made
— flagged the same way `PLATFORM_FEE_PERCENT` is in `payments.ts`. Computed
once per `CoinTopUpRequest` at creation time and stored on the row
(`amountInr`), so changing this constant later never rewrites what an
in-flight or historical request expected to be paid. **This must be
reviewed before real money moves at any meaningful volume** — it is not
wired to any live FX source and will drift from the actual USD/INR rate
over time.

## 4. Spending coins: Premium Profile only

`purchaseProfilePremiumWithCoins` (`platform-billing.ts`) is the only
spend path. It debits `coinBalance` and writes/extends a
`PlatformSubscription` row in one transaction, using a
`processorSubscriptionId` prefixed `coin:` (`COIN_FUNDED_MARKER`) instead of
a real Stripe subscription id. Deliberately reuses every existing Premium
perk-gating function (`linkCapFor`, `isProfilePremium`,
`reconcileLinkActivationForProfile`, the reduced platform fee in
`payments.ts`'s `resolveFeeRate`) rather than inventing a parallel "coin
VIP" tier — there is exactly one definition of what Premium unlocks,
regardless of which rail paid for it.

Two mechanics exist only because a coin-funded subscription has no Stripe
object backing it:

- **Renewal** extends `currentPeriodEnd` on the existing row rather than
  Stripe's own recurring billing renewing it — a coin purchase is
  one-shot, not a standing mandate.
- **Lapse**: `expireLapsedCoinSubscriptions` (`platform-billing.ts`,
  ticked every 15 min alongside `sweepLinkActivation`) is the only thing
  that notices a coin-funded row has passed `currentPeriodEnd` — a
  Stripe-funded row gets this from the billing webhook instead. Without
  this sweep, an unrenewed coin purchase would grant Premium forever.

A profile already on a Stripe-funded subscription is refused a coin
purchase (`purchaseProfilePremiumWithCoins` checks `existing &&
!existing.processorSubscriptionId.startsWith(COIN_FUNDED_MARKER)`) —
coins never override or stack with a card subscription.

### 4.1 Acceptance criteria

- [x] `coinBalance` can only be spent on `profile_premium`; no other coin
      sink exists.
- [x] A coin-funded `PlatformSubscription` grants identical perks to a
      Stripe-funded one — no separate gating logic.
- [x] An unrenewed coin subscription stops granting Premium after
      `currentPeriodEnd`, without requiring a Stripe webhook.
- [x] A user already on a card subscription cannot also spend coins on the
      same profile.

## 5. Payout — manual, mirroring the top-up flow in reverse

```
CoinPayoutRequest
  id                    uuid, pk
  user_id               uuid, fk -> User
  coin_amount           int          -- debited from coinBalance at request time, not at payment time
  amount_inr            int          -- computed via coinsToInr at request time, same peg as top-up
  vpa                   string       -- snapshot of User.payoutUpiVpa at request time
  status                enum: pending | paid | rejected
  paid_reference         string, nullable  -- admin's own UTR/reference, set when marking paid
  reviewed_at             timestamp, nullable
  reviewed_by_user_id     uuid, fk -> User, nullable
  review_note            string, nullable
  created_at             timestamp
```

Same "no payment gateway" posture as §3, mirrored in the opposite
direction — decided against integrating a real payout gateway (Razorpay
Payouts, Cashfree, RazorpayX) because that requires new vendor onboarding
and KYC, a bigger business decision than one build session should make
unilaterally. A Stripe Connect payout was also considered and rejected:
Connect moves *Stripe balance* to a connected account, and coins were
never funded through Stripe (they arrived via manual UPI transfer to the
platform's own bank account) — there's no Stripe balance backing them to
move.

1. User requests a payout of some coin amount (`requestCoinPayout`,
   `src/app/actions/wallet.ts`), gated on having a `payoutUpiVpa` already
   on file and a `MIN_PAYOUT_COINS` floor (50, same abuse-resistance
   posture as `MIN_TOPUP_COINS`). `coinBalance` is debited **immediately**,
   escrow-style, in the same transaction as the request row — this
   prevents the same coins from also being spent on Premium while a
   payout sits pending, and means a crash between the two can't debit
   coins with no request to show for it.
2. `vpa` is snapshotted from `User.payoutUpiVpa` at request time rather
   than read live later, so a subsequent address change can never
   retroactively change where an already-requested-or-paid payout is
   understood to have gone.
3. An admin manually sends the money via UPI to the snapshotted `vpa`,
   outside the app (`/admin/wallet/payouts`), using whatever reference
   their own UPI app gives them as the only record
   (`markPayoutPaid`) — same "an admin's word is the only fraud control"
   posture §3 already names for top-ups, mirrored in the direction where
   money leaves the platform instead of entering it.
4. A rejected request (`rejectPayoutRequest` — e.g. an unreachable VPA)
   refunds the escrowed coins back to `coinBalance` in the same
   transaction as the status flip.

### 5.1 Acceptance criteria

- [x] A payout request debits `coinBalance` at request time, not at
      admin-approval time.
- [x] `vpa` is a snapshot, immune to a later `payoutUpiVpa` change.
- [x] A rejected request always refunds the exact debited amount back to
      `coinBalance`, atomically with the status flip.
- [x] A payout cannot be requested without a `payoutUpiVpa` already saved.

## 6. Open questions for product/finance sign-off

- **INR peg source of truth** (§3.1): `USD_COIN_TO_INR_RATE = 90` is a
  placeholder. Needs either a live FX-linked rate or an explicit
  finance-owned static rate with a review cadence.
- **Fraud control ceiling** (§3, §5): at what approval/payout volume does
  manual, admin-eyeballed review stop being viable, and what replaces it
  (per-admin daily limits, automated bank-statement reconciliation,
  anomaly alerts)? Applies symmetrically to top-ups and payouts now that
  both exist.
- **Payout fee/spread** (§5): payouts currently convert coins to INR at
  the exact same `USD_COIN_TO_INR_RATE` peg top-ups use — no fee or
  spread is deducted. Whether a real payout (which carries a real
  bank-transfer cost) should charge one is a finance decision, not
  assumed either way in the current build.
