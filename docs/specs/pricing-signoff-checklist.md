# Pricing & Finance Sign-Off Checklist

Status: Open — nothing here blocks engineering; it blocks confident launch
of the billing-related features involved. Compiled from the "Explicit open
questions for product/finance sign-off" section of four addenda so they can
be answered in one pass instead of hunted across files.
Owner: TBD
Related: [addendum-platform-billing.md](addendum-platform-billing.md),
[addendum-premium-profiles.md](addendum-premium-profiles.md),
[addendum-custom-domains.md](addendum-custom-domains.md),
[addendum-coin-wallet.md](addendum-coin-wallet.md)

Every item below already has engineering built to support *some* answer —
these are business decisions, not missing code. Where a doc proposed a
reasonable placeholder, it's noted so sign-off can be "confirm the
placeholder" rather than starting from nothing.

## Premium Profiles ([addendum-premium-profiles.md](addendum-premium-profiles.md) §7)

- [ ] **Perk bundle confirmation** — confirm which perks actually ship,
      especially the creator platform-fee discount and its exact rate.
      *Current placeholder: `PREMIUM_CREATOR_PLATFORM_FEE_PERCENT = 0.07`
      vs. the standard `PLATFORM_FEE_PERCENT = 0.1` (`payments.ts`).*
- [ ] **Monthly/yearly price points**, and whether yearly carries the
      typical discount over monthly. *Current placeholder:
      `profile_premium: { monthly: 6, yearly: 60 }` (`platform-billing.ts`
      — note yearly-at-60 is exactly 10× monthly, i.e. no discount
      currently applied).*
- [ ] **Trial period** — does a free trial exist at all, and for how long?
      Not assumed either way in the current build.
- [ ] **Extended link cap and analytics-retention numbers** — exact
      figures need product confirmation, not just the mechanism.
      *Current placeholder: `PREMIUM_LINK_CAP` vs. `FREE_LINK_CAP = 100`
      in `platform-billing.ts`.*

## Custom Domains ([addendum-custom-domains.md](addendum-custom-domains.md) §9)

- [ ] **Claim expiry window** — 7 days proposed, not confirmed.
- [ ] **Nonpayment grace period / dormancy retention** — 14 and 90 days
      proposed, not confirmed.
- [ ] **Domains included per plan**, and pricing for additional ones
      beyond the bundled slot — shared decision with Premium Profiles
      above.
- [ ] **Apex-domain support at launch** — is subdomain-only acceptable
      initially, deferring full ALIAS/ANAME/A-record apex support?
- [ ] **Branding on custom-domain-served pages** — does an active custom
      domain hide "powered by 0dot" branding shown on the default
      `0dot.in` URL?

## Platform Billing Core ([addendum-platform-billing.md](addendum-platform-billing.md) §6)

- [ ] **Pricing for all `PlatformSubscription` plans/metering tiers** —
      the umbrella finance decision the two sections above are instances
      of.
- [ ] **`platform_fee` semantic mismatch** — on a direct-to-platform
      charge (`payee_id = null`), `platform_fee` equals the *full* charged
      amount, which reads oddly for a field named "platform fee."
      Acceptable to leave as convention, or worth a field-level rename at
      some point? Three phases of specs already reference the field's
      original meaning, so this is a "when," not urgent.

## Coin Wallet ([addendum-coin-wallet.md](addendum-coin-wallet.md) §6)

- [ ] **INR peg source of truth** — `USD_COIN_TO_INR_RATE = 90`
      (`src/lib/upi.ts`) is a hardcoded placeholder, not linked to any
      live FX source. Needs either a live-rate feed or an explicit
      finance-owned static rate with a review cadence — **should be
      resolved before real money moves at meaningful volume.**
- [ ] **Fraud-control ceiling** — both top-up approval and payout
      execution are 100% manual (an admin eyeballs a UTR / sends a UPI
      transfer by hand). At what volume does this stop being viable, and
      what replaces it?
- [ ] **Payout fee/spread** — coin-to-cash payout is now built
      (`CoinPayoutRequest`, `/admin/wallet/payouts`), converting at the
      same peg as top-ups with no fee deducted. Should a real payout
      (real bank-transfer cost) charge one?
