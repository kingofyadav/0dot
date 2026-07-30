# Addendum — Platform Billing Core & API Usage Billing

Status: Draft
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md), [roadmap-audit.md](roadmap-audit.md),
[addendum-custom-domains.md](addendum-custom-domains.md), [addendum-premium-profiles.md](addendum-premium-profiles.md),
[phase-1-foundation.md](phase-1-foundation.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-10-developer-platform.md](phase-10-developer-platform.md), [phase-14-enterprise.md](phase-14-enterprise.md)

> **Custom domains and Premium profiles now have their own full specs** —
> [addendum-custom-domains.md](addendum-custom-domains.md) and
> [addendum-premium-profiles.md](addendum-premium-profiles.md) — with
> considerably more depth than this document's original condensed
> treatment, including one correction (§3 below no longer matches the fuller
> doc's design — see the note there). This document remains the source of
> truth for the shared `PlatformSubscription` core (§2) and API usage
> billing (§4), which the two fuller specs build on rather than redefine.

## 1. Purpose

The completeness audit ([roadmap-audit.md](roadmap-audit.md) §2.1–2.3) found
three Revenue Model bullets — Custom domains, Premium profiles, API usage —
with zero coverage across all 15 phase specs. They're grouped into one
addendum rather than three because they share the same root cause: **every
payment system this roadmap has built (Phase 5's `PaymentTransaction`/
`CreatorPayoutAccount`, extended in Phases 8 and 9) is a *facilitator*
model — money flows from a buyer to a creator/seller, with 0dot taking a
cut.** All three of these bullets are the opposite: money flows from a user
**directly to 0dot itself**, with no payee on the other end. That's a real,
previously-unbuilt payment topology, not just three missing features.

## 2. Direct-to-platform billing: the topology this roadmap never built

```
PlatformSubscription
  id                        uuid, pk
  subscriber_type            enum: profile | business | organization
  subscriber_profile_id       uuid, fk -> Profile, nullable
  subscriber_business_id       uuid, fk -> Business, nullable
  subscriber_organization_id     uuid, fk -> Organization, nullable
  -- exactly one subscriber_* set, the same three-way owner XOR idiom used
  -- repeatedly since Phase 8's Event hosting and Phase 14's internal
  -- communities
  plan                        enum: profile_premium | business_subscription | enterprise
  status                       enum: active | past_due | cancelled
  processor_subscription_id      string  -- external recurring-billing object is the source of truth for renewal state, same principle as Phase 5 §4.1's MembershipSubscription
  current_period_end             timestamp
  created_at                       timestamp
```

`plan` collapses three separate Revenue Model bullets — "Premium profiles,"
"Business subscriptions," "Enterprise plans" — into one table, since all
three are the identical shape (a flat recurring charge from a subscriber
directly to 0dot) differing only in *who* is paying and what they get for
it, not in the underlying billing mechanic.

### 2.1 Reusing the payment ledger, with one honest semantic mismatch

Rather than a second transaction table, this reuses Phase 5's
`PaymentTransaction` with a new `kind = platform_subscription_charge` and
**`payee_id` left null** — the one case in this entire payment system where
there's genuinely no payee, since nothing is being facilitated to a third
party. Worth naming plainly: `platform_fee` on such a row equals the *full*
charged amount, which reads oddly for a field named "platform fee" — the
field was designed around the facilitator model, and a direct-to-platform
charge doesn't perfectly fit its original meaning. Flagging this as an
honest semantic mismatch this addendum surfaces, not a new problem to solve
by renaming a field three phases of specs already reference.

### 2.2 A different Stripe product, not the same integration

Every existing payment flow uses Stripe Connect (or equivalent) *because*
it's built for facilitating payment to third parties. A direct subscription
charge is a plain Stripe Billing/Subscriptions integration (or the
equivalent product from another processor) — a genuinely different
integration, not something Phase 5's existing Connect setup automatically
covers. Worth stating explicitly so it isn't assumed to be free reuse of
infrastructure that was built for the opposite case.

### 2.3 Verification boundary against Phase 1's monetized-verification concern

`PlatformSubscription` must **not** auto-grant `Profile.is_verified` —
Phase 1 §3.1 made verification deliberately manual, a signal of authenticity
or notability. Conflating "paid for premium" with "verified" would cheapen
a signal that's supposed to mean something else entirely — ability to pay
is not the thing verification is meant to communicate. This must stay true
even under commercial pressure to bundle a badge into a paid tier.

### 2.4 Acceptance criteria

- [ ] `PlatformSubscription` collapses Premium profiles/Business
      subscriptions/Enterprise plans into one table with a `plan` enum, not
      three parallel subscription tables.
- [ ] No `PlatformSubscription` of any plan sets `Profile.is_verified`.
- [ ] `PaymentTransaction` rows of `kind = platform_subscription_charge`
      have `payee_id = null`, distinguishing them from every facilitator-
      model transaction kind.

## 3. Custom domains — superseded by the full spec

This section's original design (a `CustomDomain` table with a three-way
`profile | business | organization` owner, and one `DomainVerification`
primitive shared with Phase 14's SSO domain check) is **superseded** by
[addendum-custom-domains.md](addendum-custom-domains.md), which corrects
two things a fuller pass surfaced: `Organization` has no public page of its
own to serve, so the owner width is two-way, not three (that doc's §2.2);
and the shared-verification-mechanism idea doesn't actually hold up once
the routing mechanics are worked through — hosting and SSO verification
need genuinely different mechanisms (that doc's §3). See that document for
the current design; nothing in this section should be treated as
authoritative anymore.

## 4. API usage billing

### 4.1 Metered, not flat — deliberately kept separate from §2

```
DeveloperApp (Phase 10) gains:
  billing_plan   enum: free | pay_as_you_go | committed
```

API usage is metered against Phase 10 §5.3's **already-existing** aggregated
rolling-window usage counters — no new tracking infrastructure, just a price
attached to counts that already exist. This is kept as its own concept
rather than folded into §2's `PlatformSubscription`, since the billing
model genuinely differs (usage-metered vs. flat recurring), not because of
an arbitrary preference for separate tables. A periodic (e.g. monthly)
`PaymentTransaction` with `kind = api_usage_charge` and `payee_id = null` —
same direct-to-platform shape as §2.1 — settles each billing period's usage.

### 4.2 Acceptance criteria

- [ ] API usage charges are computed from the existing Phase 10 §5.3
      counters — no parallel per-request billing log introduced.
- [ ] A `free`-plan `DeveloperApp` exceeding its included usage is rate-
      limited (per Phase 10 §5.3's existing tiering) rather than silently
      over-billed with no warning.

## 5. Sequencing — these don't get their own phase number

Neither §2 nor §4 can ship before their real dependencies exist, regardless
of how early the underlying *feature* conceptually feels:
- `PlatformSubscription` (§2) has no reason to exist before Phase 5, since
  it reuses that phase's `PaymentTransaction` ledger. Custom domains'
  DNS/hosting mechanics (see [addendum-custom-domains.md](addendum-custom-domains.md)
  §1) have no payment dependency and could ship earlier, with the
  subscription gate added once §2 exists — see that document's own §9/§10
  for its build sequence.
- API usage billing (§4) has no reason to exist before Phase 10, since it
  meters against infrastructure that phase builds.

Recommend treating this addendum as work picked up opportunistically
alongside or after Phase 5 (for §2, §4), rather than assigning it a single
slot in the Phase 1–15 sequence.

## 6. Explicit open questions for product/finance sign-off

- **Premium profile perk bundle**: resolved with a concrete recommendation
  in [addendum-premium-profiles.md](addendum-premium-profiles.md) §3 —
  see that document's own §7 for what's still open (exact figures, pricing,
  the creator fee-discount rate).
- **Pricing** for all three plans/metering tiers — a finance decision.
- **Processor choice for direct billing** (§2.2): confirm which product
  (Stripe Billing or equivalent) is used, distinct from the Connect-based
  integration used everywhere else in this roadmap.
- **`platform_fee` semantic mismatch** (§2.1): acceptable to leave as-is
  (100% of a direct charge, by convention), or worth a field-level fix at
  some point — flagged, not resolved, given three phases of specs already
  reference the field's original meaning.
