# Addendum — Premium Profiles (Full Spec)

Status: Draft
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md), [roadmap-audit.md](roadmap-audit.md),
[addendum-platform-billing.md](addendum-platform-billing.md), [addendum-custom-domains.md](addendum-custom-domains.md),
[phase-1-foundation.md](phase-1-foundation.md), [phase-5-creator-platform.md](phase-5-creator-platform.md)

## 1. Purpose & Scope

The personal, `Profile`-owned paid subscription tier — the "Premium
profiles" Revenue Model bullet the completeness audit found unaddressed
([roadmap-audit.md](roadmap-audit.md) §2.2). It shares the
`PlatformSubscription`/direct-to-platform billing topology defined in
[addendum-platform-billing.md](addendum-platform-billing.md) §2 — that
table's `plan = business_subscription` and `plan = enterprise` siblings
follow the identical mechanism and aren't this document's focus.

**In scope:** a concrete, reasoned perk bundle (the roadmap doesn't specify
one, so this commits to a starting design rather than leaving it undefined
— flagged for confirmation in §7, not invented as unchangeable); billing
mechanics specific to the profile tier; non-destructive downgrade
behavior; two boundaries this feature must not quietly erode.

**Out of scope:** the `PlatformSubscription` table itself (defined once,
in the billing addendum, not redefined here); business/enterprise perk
bundles (an analogous but separate design exercise).

## 2. Two boundaries this feature must not erode

Stated first, because they're easy to compromise under ordinary commercial
pressure to make a paid tier feel more valuable, and both are correctness
properties from earlier phases, not preferences:

- **Premium must never grant `Profile.is_verified`** (Phase 1 §3.1,
  restated from the billing addendum §2.3). Verification is a manual
  signal of authenticity/notability; ability to pay is a different thing
  entirely, and conflating them cheapens a signal that's supposed to mean
  something else.
- **Premium must never reopen Phase 1 §3.6's constrained theme system** —
  the fixed, token-based preset model exists specifically to avoid the XSS
  surface of arbitrary CSS/HTML. "More customization for paying users" is
  a reasonable product instinct that must stay inside that boundary (a
  larger *curated* preset library, §3.4), not an excuse to introduce raw
  markup for premium accounts specifically.

## 3. Perk bundle

### 3.1 Design approach: no generic perk-config table

Each perk below is a behavior change checked directly at its own existing
touchpoint (the link-creation endpoint checks the cap; the analytics query
checks the retention window) rather than routed through a generic
key-value "perk config" abstraction. Building a configurable perk-registry
system for a small, well-known set of toggles that doesn't exist yet would
be premature abstraction — the same restraint this series has applied
against inventing structure ahead of a real, repeated need.

### 3.2 Custom domain included

One [`CustomDomain`](addendum-custom-domains.md) slot included with an
active `profile_premium` subscription; additional domains beyond that are
separately priced (§7). The custom-domain feature's own billing gate
(§8.1 of that spec) checks for this subscription directly — no duplicate
gating logic.

### 3.3 Extended link-analytics retention

Phase 1 §4.3's link-click analytics already logs an append-only,
privacy-safe event per click (no raw IP/UA, per that section) — this perk
changes what's **queryable**, not what's **collected or retained** at the
storage layer. Recommendation: retain click events indefinitely at the
storage layer regardless of tier (cheap, since the log is already
lightweight and PII-free), but gate the analytics query/display window by
subscription status — e.g. a free tier's dashboard shows the trailing 30
days, premium shows the full history. This means a user who upgrades later
immediately sees their complete historical analytics, rather than having
lost data during a period they weren't paying — a real, concrete advantage
of gating the *view* instead of the *retention*.

### 3.4 Higher link cap, and a larger — still curated — theme library

- Phase 1 §4.2 flagged its 100-link soft cap as something to confirm with
  product rather than a fixed number; premium is the natural place to
  raise or remove it. The link-creation endpoint checks subscription
  status before enforcing which cap applies.
- Premium unlocks a larger set of curated theme presets (e.g. 20–30
  additional options beyond the free tier's 5–8) — same token-based schema
  Phase 1 §3.6 defined, more choice within it, never raw CSS/HTML/JS. This
  is the concrete form §2's second boundary takes: expand the *menu*, not
  the *mechanism*.

### 3.5 A distinct Premium badge — never substitutable for verification

A separate visual indicator from the verified checkmark (different icon,
different color) — the two can co-occur on a profile that happens to be
both verified and premium, but are never conflated or interchangeable, the
concrete UI expression of §2's first boundary.

### 3.6 A reduced creator platform fee — a cross-phase incentive loop

Recommended: an active `profile_premium` subscriber earning through
Phase 5's creator monetization pays a reduced `PaymentTransaction.
platform_fee` rate on their own creator earnings (exact discount is a
finance decision, §7) — Phase 5's fee-calculation logic checks the
creator's `PlatformSubscription` status at charge time. This creates a
genuine incentive loop: a creator already earning money on the platform has
a concrete, quantifiable reason to also pay for premium, rather than
premium being a purely cosmetic upsell disconnected from the platform's
other revenue lines.

### 3.7 Contingent perks — not built until their dependency exists

Two plausible perks depend on features that don't exist yet and shouldn't
be half-built to accommodate them speculatively:
- **Ad-free experience**: the roadmap marks "Advertising" optional and it
  remains entirely unbuilt (confirmed non-gap, [roadmap-audit.md](roadmap-audit.md)
  §2.6) — if and when an ad system is ever built, premium accounts should
  be exempted from it; there's nothing to exempt anyone from today.
- **Storage quota bump**: contingent on Phase 16 §14's Cloud Storage, which
  is itself flagged there as needing a scope-appetite decision before any
  build. If storage ships, premium's quota tier is a natural perk; not
  before.

### 3.8 Acceptance criteria

- [ ] No perk in this bundle is implemented via a shared generic
      perk-config table — each checks subscription status at its own
      existing touchpoint.
- [ ] No premium theme preset introduces anything beyond Phase 1 §3.6's
      existing token schema.
- [ ] The Premium badge renders as visually distinct from the verified
      badge in every surface that displays either.

## 4. Billing mechanics

### 4.1 Reusing PlatformSubscription, with one addition

```
PlatformSubscription (addendum-platform-billing.md §2) gains:
  billing_interval   enum: monthly | yearly
```

This field wasn't in the billing addendum's original table — surfaced
here because giving premium profiles proper depth requires it, the same
`monthly | yearly` shape Phase 5 §4.1's `MembershipTier` already
established, reused rather than inventing a new interval representation.
A `profile_premium` row is created with `subscriber_type = profile`,
`subscriber_profile_id` set, `plan = profile_premium`.

### 4.2 Cancellation retains access through the current period

Reuses the exact rule Phase 5 §4.3 established for membership
subscriptions: cancelling retains perks through `current_period_end`, not
immediately — a consistent billing-UX convention across every subscription
type in this system, not a new one invented for this tier specifically.

### 4.3 Acceptance criteria

- [ ] Cancelling a `profile_premium` subscription retains perks through
      `current_period_end`, matching Phase 5 §4.3's rule.
- [ ] `billing_interval` is honored by the processor-side recurring billing
      object, which remains the source of truth for renewal timing (Phase 5
      §4.1's principle, applied here).

## 5. Downgrade and lapse — non-destructive, matching this series' general posture

Consistent with the same bias toward non-destructive transitions used
throughout (Phase 12 §8.2, Phase 14 §4.2, and this addendum's own sibling
custom-domains document §8.2):

- **Links beyond the free cap**: not deleted — become inactive (hidden
  from the public profile) until either the count drops back under the
  free cap or premium is resumed. Reactivating on resubscription is
  instant, since nothing was destroyed.
- **Analytics**: display window narrows back to the free tier's retention
  window; underlying data is untouched (§3.3) and becomes visible again
  immediately on resubscription.
- **Theme preset**: a currently-applied premium-tier preset stays applied
  (nothing about the profile's current appearance breaks on lapse), but
  switching to a *different* premium-tier preset is unavailable until
  premium is resumed.
- **Custom domain**: follows its own document's lapse sequence in full
  ([addendum-custom-domains.md](addendum-custom-domains.md) §8.2) — grace
  period, then suspension, then dormancy — not duplicated here.

### 5.1 Acceptance criteria

- [ ] A lapsed subscriber's excess links are marked inactive, never
      deleted, and reactivate automatically on resubscription.
- [ ] A lapsed subscriber's currently-applied theme preset continues to
      render correctly — lapse never breaks an already-configured profile's
      appearance.

## 6. Cross-cutting concerns

### 6.1 Privacy

Premium does not change *what* is collected for link analytics, only how
far back the query window reaches (§3.3) — paying for premium never
unlocks more invasive tracking than the free tier's privacy-safe baseline
established in Phase 1 §4.3. Worth stating explicitly so a monetization
feature is never mistaken for a reason to loosen a privacy guarantee
elsewhere in the system.

### 6.2 Security

No perk in this bundle introduces a new write path, new content-injection
surface, or new authentication mechanism — every perk is a threshold or
quantity change on an existing, already-validated code path (link cap,
query window, preset selection), which is a large part of why this feature
is low-risk relative to most of what this series has specified.

## 7. Explicit open questions for product/finance sign-off

- **Perk bundle confirmation**: the bundle in §3 is a reasoned starting
  design, not a final decision — confirm which perks ship, especially the
  creator platform-fee discount (§3.6) and its exact rate.
- **Pricing and billing interval discount**: monthly/yearly price points,
  and whether yearly carries the typical discount over monthly.
- **Trial period**: whether a free trial exists at all, and its length if
  so — not assumed either way here.
- **Extended link cap and analytics-retention numbers**: exact figures for
  the raised link cap and free-vs-premium analytics window need product
  confirmation, not just the mechanism this spec defines.
- **Additional custom domains beyond the included one**: pricing for
  domains beyond the single bundled slot (§3.2) — a finance decision shared
  with [addendum-custom-domains.md](addendum-custom-domains.md) §9.

## 8. Suggested build sequence

1. `PlatformSubscription.billing_interval` addition + `profile_premium`
   plan creation/billing flow, reusing
   [addendum-platform-billing.md](addendum-platform-billing.md) §2's
   Stripe Billing integration + Phase 5 §4.3's cancel-through-period-end
   rule (§4).
2. Link-analytics query-window gating (§3.3) and link-cap gating (§3.4,
   first half) — both are small, independent checks against existing
   Phase 1 endpoints.
3. Expanded curated theme-preset library (§3.4, second half) — reinforce
   the token-schema boundary from §2 explicitly during this step, not as
   an afterthought.
4. Distinct Premium badge, visually separated from verification (§3.5).
5. Non-destructive downgrade handling for links and theme presets (§5) —
   sequence alongside steps 2–4, since each perk's downgrade behavior is
   naturally built with its activation logic, not bolted on later.
6. Custom domain inclusion (§3.2) — depends on
   [addendum-custom-domains.md](addendum-custom-domains.md) existing;
   sequence once that feature's own billing gate is in place.
7. Creator platform-fee discount (§3.6) — depends on Phase 5's fee
   calculation and on the discount rate being confirmed (§7); lowest
   priority given it needs a finance decision first.
8. Contingent perks (ad exemption, storage quota) — not built until their
   underlying features exist (§3.7).
