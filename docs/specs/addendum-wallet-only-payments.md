# Addendum — Wallet-Only Payments (Remove Stripe)

Status: **All 5 phases built** (2026-09-27) — §1.3 copy, §3.1–§3.6, §4
(monthly allowance), and Phase 5 (drain & delete Stripe, `9920093`) landed
the same day. Verified live: no `stripe` package dependency, no
`src/lib/stripe*.ts`, no Stripe webhook routes, no `User.stripeCustomerId`
or `CreatorPayoutAccount` model — `PaymentTransaction.processor` keeps
`stripe_connect` only as a historical default value for rows written before
this addendum (see `prisma/schema.prisma`'s comment on that column).
Owner: TBD
Related: [addendum-coin-wallet-v2.md](addendum-coin-wallet-v2.md),
[addendum-platform-billing.md](addendum-platform-billing.md),
[addendum-premium-profiles.md](addendum-premium-profiles.md),
[phase-5-creator-platform.md](phase-5-creator-platform.md),
[phase-9-marketplace.md](phase-9-marketplace.md),
[phase-10-developer-platform.md](phase-10-developer-platform.md)

**Product decision locked (2026-09-27):** the coin wallet becomes the
**only** way to pay for anything on 0dot, and coins are **pure platform
credits** — no payment gateway of any kind, no way to buy coins with
money, no way to cash coins out. Stripe (Checkout, Billing, Meters,
Connect) is removed entirely.

---

## 0. Why

Today every paid surface runs two rails side by side: Stripe (card) and
the coin ledger (`src/lib/wallet/`, see coin-wallet v2). The coin rail is
already built for almost everything. Keeping Stripe means keeping
Connect onboarding, two webhook routes, a metered-billing integration,
and the regulatory surface of real-money facilitation — for a platform
that wants a single in-app economy.

This addendum removes the card rail and makes the coin rail complete.

---

## 1. Posture — coins are credits, not money

This replaces coin-wallet v2 §3's "closed loop at par value" framing with
something strictly lighter:

1. **No money in.** Coins enter only through platform issuance: signup /
   launch-promo grants, referral rewards, admin grants, refunds-as-coins,
   and — by circulation — creator/business earnings from other users'
   coin spend.
2. **No money out.** No payout, no withdrawal, no conversion. The reserved
   `system_external_suspense` account and `payout` transaction kind (v2
   §4.2) stay unused; this addendum does **not** plan to use them.
3. **No peg.** Drop "1 coin = 1 USD" from user-facing copy (wallet page,
   `PurchaseVipForm`, `content/USER_GUIDE.md`, terms/help). A coin is a
   coin. Internally, prices keep their existing numeric value, read as a
   coin amount (§4.1).
4. **Not an asset.** Unchanged from v2: no market, no speculation, no
   token-gating.

Because nothing of monetary value enters or leaves, the PPI / money
transmission concerns in v2 §3 fall away. Terms of service must say
plainly that coins have no cash value and can't be redeemed for money.

---

## 2. Stripe surface inventory

| Surface | Today | Action |
|---|---|---|
| Tips, donations, digital products, courses, offerings, event tickets | Card **or** coins (`payWith`) | Remove card path (§3.1) |
| Memberships | Card (recurring) or coins (first period only) | Coin-only, auto-renew from coins (§3.3) |
| Profile Premium, business plan | Card (recurring) or coins (per period) | Coin-only, auto-renew from coins (§3.3) |
| Marketplace listings (`marketplace.ts`) | **Card only** | Add coin path (§3.2) |
| Developer API plans (`api-usage-billing.ts`) | **Stripe only** (Billing + Meters) | Bill from wallet (§3.4) |
| Creator/business payouts (`CreatorPayoutAccount`, Connect v2) | Required to receive card sales | Remove (§3.5) |
| Affiliate commissions (`affiliate.ts`) | Paid on card sales only | Decide (§8 #3) |
| Refunds | None wired; `refundToWallet` exists (v2 §7.3) | All refunds are coins (§3.6) |
| Apple IAP / Google Play batches (`iap-payouts.ts`, `/admin/payments/iap-batches`) | Admin-recorded store payouts | Decide (§8 #4) |
| `src/lib/stripe*.ts`, `api/stripe/webhook`, `api/stripe/webhook-v2`, `User.stripeCustomerId`, `stripe` package | Infrastructure | Delete (§5) |

The mobile app has no Stripe code — it already pays through
`/api/v1/wallet/*`.

---

## 3. Changes

### 3.1 Coin-only purchase flows

For tips, donations, digital products, courses, offerings and tickets:

- Delete the card branch of each action (`getPaymentProcessor()
  .createPurchaseCheckoutSession`, the payout-account gate, the Stripe
  `metadata`). The coin branch (`settleCoinPurchase` / `placeHold`)
  becomes the only path; the `payWith` form field goes away.
- Forms (`TipForm`, `DonateForm`, `DigitalProductCard`, `CourseBuyButton`,
  `OfferingBuyButton`, `EventActions`, `SubscribeForm`,
  `MarketplacePurchaseButton`) show a single coin button plus the buyer's
  balance. **Built:** also the business plan (card subscribe action and
  form removed; the billing page uses the business-wallet coin form),
  every price display (`formatCoins`, web and mobile), and the creator
  price forms, which no longer ask for a currency — the server stores
  `"usd"` iff a price is set until the column is retired (§4.1). On
  `INSUFFICIENT_FUNDS`, show the shortfall and a link to `/wallet`
  (how to earn coins) — there is no "top up".
- `activateXxx` functions stay: the coin path calls them via
  `createRows`. Only their Stripe-webhook call sites go.

### 3.2 Marketplace coin path

`purchaseMarketplaceListing` gets the same shape as `digital-products.ts`:
`settleCoinPurchase({ kind: "marketplace_purchase", payeeUserId |
payeeBusinessId, relatedObjectType: "marketplace_listing", ... })` with a
`createRows` that writes `MarketplacePurchase` and increments
`purchaseCount`. The existing `@@unique([listingId, buyerId])` gives
double-purchase protection (the P2002 branch in `settleCoinPurchase`).
Free listings are unchanged. (`POST /api/v1/wallet/purchases` covers only
premium and tips today; API parity for one-time purchases is a separate
gap, not specific to the marketplace.)

### 3.3 Recurring charges from coins

Resolves coin-wallet v2 §18 #5: **coins auto-renew**.

- New `autoRenew Boolean @default(false)` on both `PlatformSubscription`
  and `MembershipSubscription`. Every coin purchase sets it; rows bought
  before this change keep `false` and lapse at period end as they were
  sold, so nobody is charged without having opted in.
- `renewCoinPlatformSubscriptions` / `renewCoinMemberships` in the
  platform-billing sweep, run *before* `expireLapsedCoinSubscriptions` /
  `expireLapsedCoinMemberships` (which now only touch `autoRenew: false`
  rows). For each coin-funded row with `autoRenew`, `status` active or
  past_due, and `currentPeriodEnd <= now`:
  - `chargeWallet` for one period, idempotency key
    `renew:<subscriptionId>:<currentPeriodEnd ISO>` (so a re-run of the
    sweep can't double-charge the same period);
  - on success, advance `currentPeriodEnd` by one interval in the same
    transaction;
  - on `INSUFFICIENT_FUNDS`, set `status: "past_due"` and notify the
    payer once (`subscription_renewal_failed`; business owners for a
    business plan). A `past_due` coin row keeps access for a **3-day grace
    period** (`COIN_RENEWAL_GRACE_MS`, placeholder), is retried each sweep,
    and is cancelled when grace ends;
  - a suspended/deactivated payer or an archived tier turns `autoRenew`
    off, so the row ends at period end instead of charging.
- "Cancel" is the existing `status: "cancelled"`, which already means
  "keep access until `currentPeriodEnd`, then stop" and is never renewed.
  A `past_due` coin row can be cancelled too (stops retries).
- Access checks share one clause, `effectivelyActiveWhere()` in
  `src/lib/subscription-access.ts` (active, cancelled-until-period-end,
  coin past_due in grace), used by platform billing, tier access and
  custom domains. It replaces three copies of a module-level constant that
  evaluated `new Date()` once at server start.
- Business plans charge the business wallet (`spendBusinessCoins`), as
  `purchaseBusinessPlanWithCoins` does today.
- Once Stripe rows are gone (§6), the `COIN_FUNDED_MARKER` /
  `processorSubscriptionId` distinction is meaningless. Keep the column
  for now, stop branching on it after §6 completes; drop it later.

### 3.4 Developer API plans

**Built.** Stripe Billing + Meters are replaced by wallet charges
(`api-usage-billing.ts`) from the app owner's wallet, or the business
wallet for a business-owned app. Plan changes go through `switchApiPlan`
and settle synchronously — no checkout redirect.

- **committed**: `COMMITTED_PLAN_FLAT_PRICE` coins charged up front when
  chosen (refused, plan unchanged, if the wallet is short), then each
  `BILLING_PERIOD_MS`, keyed by the period it pays for.
- **pay_as_you_go**: nothing up front. Overage beyond
  `INCLUDED_FREE_REQUESTS_PER_PERIOD` is charged **as it accrues** —
  every settlement sweep charges whole 1,000-request blocks not yet billed
  (`DeveloperApp.billedOverageRequests`), and the partial remainder when
  the period closes or the app leaves the plan. Charging only at period
  end would let an app with no coins run uncapped for a whole period. The
  idempotency key is the cumulative billed level, so no request is billed
  twice.
- Any charge the wallet can't cover moves the app to `free` (rate-limited
  again), logs the unpaid amount, and notifies the owner
  (`api_plan_downgraded`). No debt is carried.
- Apps with an existing Stripe `apiSubscriptionId` keep being billed by
  Stripe until drained (§6); choosing any plan cancels it first.
  `createApiPlanCheckoutSession` and the Stripe price/meter bootstrap are
  deleted; the webhook-side `activateApiPlanSubscription` /
  `recordApiUsageInvoicePaid` and meter reporting remain for those legacy
  apps and go in §5.

### 3.5 Remove payouts

With no cash-out, `CreatorPayoutAccount` has no purpose:

- Delete the "enable payouts" gate from every coin path that still has
  one, the onboarding actions (`src/app/actions/payments.ts`),
  `PayoutOnboardingForm`, `stripe-connect-countries.ts`, and the
  `/s/[username]` and business-settings payout UI.
- Drop the `CreatorPayoutAccount` model in the §5 migration.
- **Built:** the onboarding actions, form, `/monetization/payouts` page
  and nav link, `stripe-connect-countries.ts`, the event host panel's
  business payout button, the fundraiser and services payout notices and
  the feed's "Payouts" chip (now a wallet link) are gone. The model and
  the `webhook-v2` status sync stay until §5.
- Side effect: affiliate commissions were only credited by the Stripe
  webhook activators, so with the card path gone no new commissions
  accrue until §8 #3 is decided.
- Creator and business earnings already accrue as coins in their wallet
  (`chargeWallet` credits the payee). Surface "Earnings" on the creator
  dashboard from `LedgerPosting` rows of kind `purchase`.

### 3.6 Refunds

Resolves coin-wallet v2 §18 #4: every refund is a coin refund via
`refundToWallet`. Built: `/admin/payments/refunds` lists recent coin
payments (filterable by payer) with a full-refund form that requires a
reason (`refundPaymentAction`). It does not revoke what was bought.
Seller-initiated refunds and partial refunds are not built. Note this refunds from
`system_refund_source`, not from the seller — clawing back from the
seller's wallet is §8 #2.

### 3.7 Platform fee

Unchanged: `PLATFORM_FEE_PERCENT` / premium-creator rate still apply to
coin sales and land in `system_platform_revenue`. With no cash-out this
is now a **coin sink** — it removes coins from circulation, which matters
for §4.

---

## 4. Coin economy

With no way to buy coins, supply is whatever the platform issues. Today
that's small: a signup grant, `LAUNCH_PROMO_COINS = 6` (restricted,
expiring), referral rewards `3 + 3` (cap 25), and admin grants. Sinks
are the platform fee, promo expiry, and purchases paid to 0dot (Premium,
business plans, API plans — the whole amount is platform revenue).

Premium costs 6 coins/month and a business plan 20 coins/month
(`PLAN_PRICES`).

**Decided and built (2026-09-27): a monthly allowance of 10 coins.**
`runMonthlyAllowanceSweepOnce` (`src/lib/wallet/grants.ts`, daily cron)
issues `MONTHLY_ALLOWANCE_COINS` from `system_promo_issuance` as a new
ledger kind, `monthly_allowance`:

- once per account per calendar month (UTC), keyed
  `monthly_allowance:<userId>:<yyyy-mm>`; an account that becomes active
  mid-month is picked up the next day;
- into the restricted bucket with a 90-day TTL — spendable, not
  transferable, and swept by the promo-expiry job like other grants, so an
  idle account stacks at most ~3 months;
- only to accounts that are `active`, not scheduled for deletion, at
  least 7 days old, and used in the last 30 days (a web session's
  `lastSeenAt`, or an OAuth token issued — the mobile app refreshes tokens
  while in use).

It is deliberately *not* counted by the anomaly scan's issuance-spike
check or the admin issuance audit (it's automatic and predictable).
Activity rewards, a bigger signup grant, and lower prices were considered
and not chosen.

Known exposure: restricted coins can still be spent on creators, whose
earnings arrive spendable, so many farmed accounts could funnel allowance
to one creator. The account-age and activity gates limit this; the
anomaly scan's sybil check covers transfers but not tips/purchases.

### 4.1 Units and pricing

Every existing `price Float` + `currency` pair is read as a coin price:
`price: 12.99` means 12.99 coins (1299 minor units, v2 §4.1). No data
migration is needed. New listings and plans stop asking for a currency;
new `PaymentTransaction` rows from coin charges keep `processor:
"wallet"`. Renaming `amountUsd` → `amountCoins` in `chargeWallet` and
friends is a follow-up cleanup, not a prerequisite.

---

## 5. Stripe removal

After §3 ships and §6 has drained live Stripe state:

- Delete `src/lib/stripe.ts`, `src/lib/stripe-connect-countries.ts`,
  `src/lib/stripe-webhook-fulfillment.ts` (+ its test),
  `src/app/api/stripe/webhook/route.ts`,
  `src/app/api/stripe/webhook-v2/route.ts`.
- `src/lib/payments.ts`: delete `PaymentProcessor`,
  `StripeConnectPaymentProcessor`, `getPaymentProcessor`,
  `checkoutIdempotencyKey`. Keep `recordPaymentTransaction`,
  `resolveFeeRate`, fee constants. Narrow `processor` to `"wallet"`
  (plus IAP values if §8 #4 keeps them).
- `src/lib/platform-billing.ts`: delete `SubscriptionProcessor`,
  `ensurePriceId`, `subscribe*`, `activateSubscriptionFromCheckout`,
  `syncSubscriptionFromStripe`, and the Stripe branch of
  `cancelPlatformSubscription`.
- `src/app/actions/memberships.ts`: delete `activateMembershipSubscription`
  and the Stripe cancel path.
- Migration: drop `User.stripeCustomerId`, `CreatorPayoutAccount`,
  `DeveloperApp.apiSubscriptionId`.
- Remove the `stripe` dependency, `STRIPE_*` env vars (`.env.example`,
  deploy docs), the Stripe webhook from the Stripe dashboard, and Stripe
  from `next.config.ts` / CSP if present.
- Copy: privacy policy (Stripe as sub-processor), terms (coins have no
  cash value), help, `content/USER_GUIDE.md`, `GUIDE.txt`, `README.md`.
- Mark superseded sections: coin-wallet v2 §3/§18 #4/#5/#7,
  platform-billing §2/§4, phase-5 §3 (Connect).

---

## 6. Draining existing Stripe state

Before §5, check production for:

1. Active Stripe-funded `PlatformSubscription` / `MembershipSubscription`
   rows (`processorSubscriptionId` not `coin:`), and DeveloperApps with
   an `apiSubscriptionId`.
2. Connect accounts with a non-zero balance or pending transfers.
3. Undisputed charges still inside the dispute/refund window.

If all three are empty, delete immediately. Otherwise: stop creating new
Stripe checkouts (ship §3 first), set every live Stripe subscription to
`cancel_at_period_end`, and keep the webhook routes until the last period
ends and Connect balances pay out. Optionally offer affected subscribers
a coin grant equal to their remaining period (admin grant, audited).

---

## 7. Build sequence

Each phase ships on its own and leaves the app working.

- **Phase 1 — Complete the coin rail.** Marketplace coin path (§3.2),
  coin auto-renew + grace (§3.3), refund caller
  (§3.6). Stripe still present.
  *Acceptance:* every paid surface can complete with coins; a coin
  membership renews on the sweep and lapses after grace when the fan is
  out of coins; a re-run sweep never double-charges a period.
- **Phase 2 — API plans on coins** (§3.4).
- **Phase 3 — Economy** (§4): whichever earning paths product picks, and
  the no-peg copy change (§1.3).
- **Phase 4 — Coin-only UI.** Remove every card branch and `payWith`
  (§3.1), payout gates and onboarding (§3.5). Stripe code is now
  unreachable.
- **Phase 5 — Drain & delete** (§6, §5).
  *Acceptance:* `rg -i stripe src` finds nothing; `npm run build`,
  lint, tests green; reconciliation cron still green.

---

## 8. Open questions

1. **Ongoing coin supply** (§4) — allowance, activity rewards, bigger
   grants, or lower prices? Amounts and caps.
2. **Refund funding** — refund from `system_refund_source` (platform eats
   it) or claw back from the seller's wallet?
3. **Affiliate commissions** — pay affiliates in coins on coin sales
   (v2 deferred this), or drop the affiliate program?
4. **IAP rail** — `apple_iap` / `google_play_billing` records store
   payouts of real money. Under pure credits nothing is sold for money in
   the apps either; remove it with Stripe?
5. **Grace period / retry** for failed renewals — 3 days is a
   placeholder.
6. **Existing Stripe customers** (§6) — any coin compensation for
   cancelled card subscriptions?
