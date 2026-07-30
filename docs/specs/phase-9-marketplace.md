# Phase 9 — Marketplace Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md), [phase-8-events.md](phase-8-events.md)

## 1. Purpose & Scope

Phase 9 has been referenced by name in nearly every prior monetization
decision in this series: Phase 4 deferred real checkout to it (§8.2 of that
spec), Phase 5 flagged its own digital-downloads feature as "very likely the
same thing" (§5.1 of that spec), and Phase 5 asked whether Phase 4's Store
should be upgraded once the payment backbone existed rather than waiting
(§14 of that spec). **The central finding of this spec is that most of
Phase 9 is not new commerce infrastructure — it's a cross-seller discovery
and browse layer over infrastructure Phases 4, 5, and 8 already built and
proved reusable.** Only three of the roadmap's six categories (Apps, Themes,
Templates) need genuinely new schema; Courses, Digital products, and
Freelance services are existing entities getting a new storefront in front
of them.

**In scope:** resolving the Phase 4/5 Store deferral with real checkout;
extending Phase 4's booking system to individual freelance sellers; a new
`MarketplaceListing` entity for Apps/Themes/Templates with a review gate; a
cross-entity browse/discovery experience; marketplace-specific reviews.
**Out of scope:** a true third-party app ecosystem with API/OAuth-scoped
integrations (that needs Phase 10's developer platform to exist first — see
§5.1, a real cross-phase sequencing conflict worth naming explicitly);
reopening Phase 1's decision against arbitrary custom CSS/HTML themes (§4.1);
escrow/milestone-based freelance project management (§3.3).

## 2. Success Criteria

- A business's product catalog (Phase 4 `Offering`) gets real in-app
  checkout, proving the payment backbone Phase 5 built now generalizes
  across a third phase (creators in Phase 5, tickets in Phase 8, business
  commerce here).
- An individual can list a freelance service and get paid, using the same
  booking/payment machinery a business would, not a separate freelancer
  product.
- Apps, Themes, and Templates are sellable without reopening either of two
  security decisions made earlier in this series: no arbitrary theme
  CSS/HTML (Phase 1 §3.6) and no third-party code execution without a
  developer platform (deferred to Phase 10, see §5.1).
- A buyer can browse one unified Marketplace experience spanning all six
  roadmap categories without needing to know which underlying entity
  (Course, DigitalProduct, Offering, or MarketplaceListing) actually backs
  each result.

## 3. Resolving the Phase 4/5 Store deferral

### 3.1 Business Store gets real checkout

Phase 4 §8.2 explicitly deferred all payment processing for the Business
Store, recommending external payment links or contact-for-pricing only,
specifically to avoid building a second, throwaway checkout system ahead of
this phase. With the payment backbone now proven across Phase 5 (creator
purchases) and Phase 8 (ticket purchases), that deferral is resolved here:

```
OfferingPurchase
  id                       uuid, pk
  offering_id              uuid, fk -> Offering
  buyer_id                 uuid, fk -> User
  payment_transaction_id   uuid, fk -> PaymentTransaction  -- kind = business_purchase (new) or freelance_purchase (new), see §3.2
  quantity                 integer, default 1
  status                   enum: pending | fulfilled | refunded
  created_at               timestamp
```

Fulfillment tracking is intentionally minimal — a status enum the seller
updates manually, not a shipping/logistics system — matching the same
"don't build what wasn't asked for" restraint Phase 4 §7.1 already applied
to inventory (a status enum, not real stock-quantity tracking, which remains
unchanged and out of scope here too). An `Offering` can still link out to an
external payment page instead of using native checkout if the seller prefers
— native checkout is now available, not mandatory.

### 3.2 Freelance services: extending ownership, not inventing a new system

The roadmap's "Freelance services" category is, functionally, exactly Phase
4's bookable-service `Offering` + `Appointment` system (§7.1 and §10 of that
spec) — except a freelancer is often an individual, not a `Business`. Rather
than build a parallel freelancer-specific product, Phase 4's booking trio
gains a second ownership option:

```
Offering gains:
  seller_user_id   uuid, fk -> User, nullable
  -- exactly one of business_id (Phase 4) / seller_user_id is set — a two-way owner XOR, the same idiom already used for Link (Phase 4 §3.2) and CreatorPayoutAccount (Phase 8 §5.2)

AvailabilityRule gains:
  seller_user_id   uuid, fk -> User, nullable
  -- business_id becomes nullable; same two-way XOR as above

Appointment gains:
  seller_user_id   uuid, fk -> User, nullable
  -- business_id becomes nullable; same two-way XOR
```

An individual freelancer needs a `CreatorPayoutAccount` (Phase 5 §3.1,
already `user_id`-owned) to receive payment — no new payout mechanism, the
existing one already covers this case since it was never business-exclusive.

### 3.3 Explicitly not building escrow or milestones

A freelance marketplace could plausibly want scoped-project escrow,
milestone payments, and dispute resolution — that's a substantially larger
undertaking (comparable in weight to the payment-backbone build in Phase 5
itself) and isn't what "list a bookable service" requires. Phase 9 ships
single-session/fixed-scope bookings only, paid up front via the existing
`Appointment` flow; multi-milestone freelance engagements are flagged as an
open question (§8) rather than built speculatively.

### 3.4 Acceptance criteria

- [ ] An `Offering` purchase writes a `business_purchase`- or
      `freelance_purchase`-kind `PaymentTransaction`, reusing the Phase 5
      ledger — no new transaction table.
- [ ] `Offering`/`AvailabilityRule`/`Appointment` each have exactly one of
      `business_id`/`seller_user_id` set, never both, never neither.
- [ ] An individual seller without an `active` `CreatorPayoutAccount` cannot
      receive a paid booking, same gate Phase 5 §3.5 established for
      creators generally.

## 4. New sellable categories: Themes, Templates, Apps

### 4.1 Themes do not reopen Phase 1's CSS/HTML decision

Phase 1 §3.6 deliberately restricted profile theming to a fixed set of
presets with a small number of overridable tokens (accent color, background,
font), explicitly ruling out arbitrary CSS/HTML/JS injection as an XSS
surface, and named a "sanitization strategy" as the prerequisite for ever
lifting that restriction. A Themes marketplace does **not** meet that bar
just by existing — a marketplace theme in Phase 9 is still expressed as the
same constrained token schema Phase 1 defined, now authored by third-party
designers and gated behind a review step (§4.3) before listing, not raw
markup. If a genuinely richer theming experience is wanted later, that's the
sanitization-strategy project Phase 1 named — a separate, larger security
undertaking this phase does not undertake by proxy.

### 4.2 Apps are scoped narrowly — a real roadmap sequencing conflict

The roadmap places Marketplace (Phase 9, this spec) before Developer
Platform (Phase 10 — public API, OAuth "Sign in with 0dot," webhooks). An
open, third-party "Apps" ecosystem in the usual sense (installable
integrations that request API scopes, act on a user's behalf, receive
webhooks) fundamentally **requires** those Phase 10 primitives to exist
first. Building a real app-authorization model now would mean either
duplicating OAuth/scopes ahead of Phase 10 or shipping something that has to
be redone once Phase 10 lands — worth flagging to product/roadmap owners as
a genuine sequencing question (§8), not silently worked around.

The pragmatic resolution for Phase 9: "Apps" here means **review-gated,
sandboxed widgets** with a fixed, pre-approved capability set — not
arbitrary third-party code with API access. A widget can, for example,
embed content from an allowlisted set of trusted external providers (an
oEmbed-style allowlist, not an arbitrary `iframe src`) or render one of the
platform's own sanitized form-builder blocks — never raw HTML/JS supplied by
the listing's seller. A true open app ecosystem is the natural evolution of
this category once Phase 10 exists; it is not forced into this phase.

### 4.3 Data model

```
MarketplaceListing
  id                    uuid, pk
  seller_type           enum: user | business
  seller_user_id        uuid, fk -> User, nullable
  seller_business_id    uuid, fk -> Business, nullable
  -- two-way owner XOR, same idiom as §3.2 — communities are not sellers here, consistent with Phase 8 §5.2 excluding communities from commerce entirely
  category              enum: theme | template | app
  title                 string, 1-120 chars
  description           text  -- sanitized markdown
  price                 decimal, nullable  -- nullable = free
  currency              string, nullable
  status                enum: pending_review | active | rejected | archived
  payload               jsonb  -- category-specific structured content: a theme token set, template starter-data, or an app's declarative widget config — never raw HTML/CSS/JS in any category
  average_rating         decimal, nullable  -- denormalized, see §6
  review_count           integer, default 0
  purchase_count          integer, default 0
  created_at             timestamp
  updated_at             timestamp

MarketplacePurchase
  id                       uuid, pk
  listing_id               uuid, fk -> MarketplaceListing
  buyer_id                 uuid, fk -> User
  payment_transaction_id    uuid, fk -> PaymentTransaction, nullable  -- null if the listing is free
  created_at               timestamp

InstalledApp
  id                       uuid, pk
  listing_id               uuid, fk -> MarketplaceListing  -- category = app
  installer_type           enum: user | business | community
  installer_user_id        uuid, fk -> Profile, nullable
  installer_business_id    uuid, fk -> Business, nullable
  installer_community_id   uuid, fk -> Community, nullable
  -- three-way installer XOR — wider than the seller XOR above because a widget can attach to a profile, a business page, or a community, all three of which are real installation surfaces, unlike selling where communities were deliberately excluded (§3.2); the XOR width is chosen per actual need each time, not copied uniformly across every use of the idiom
  config                   jsonb  -- installer-specific settings within the app's declared schema
  installed_at             timestamp
```

### 4.4 Templates: cloned through normal validation, not a bulk-insert bypass

Applying a `Template` listing (e.g. a starter Project structure, a
Community rule/wiki starter kit) pre-fills a creation form with the
template's `payload` data — it goes through the exact same creation
endpoint and validation as manually entering that data, not a privileged
bulk-insert path. This matters specifically because it prevents a template
from being used to smuggle content past normal sanitization/validation
(e.g. an oversized field, a disallowed URL scheme) simply because it arrived
as a pre-fill rather than direct user input.

### 4.5 Review gate before going live

No `MarketplaceListing` transitions to `active` without passing a review
step — at minimum a manual moderator queue, with automated content-safety
screening as a supplement, not a replacement, for `app` and `theme`
categories given their elevated risk relative to a plain digital download
(a widget is code-adjacent even when sandboxed; a theme or template is
common ground for copyright/IP disputes over design assets — see §7). This
is the same "some gate must exist before going live" pattern already applied
to business claims (Phase 4 §3.3) and restricted-community joins (Phase 3
§3.1), now applied to a new, similarly elevated-risk surface.

### 4.6 Acceptance criteria

- [ ] No `MarketplaceListing.payload` in the `theme` category contains
      anything beyond the same token schema Phase 1 §3.6 defined — verified
      at write time, not left to review alone to catch.
- [ ] No `app`-category `payload` can specify an arbitrary embed source
      outside the provider allowlist, and never contains raw HTML/JS.
- [ ] A `MarketplaceListing` cannot reach `status = active` without having
      passed through `pending_review` first — there is no direct-to-active
      creation path.
- [ ] Applying a `template` payload to create a new entity fails the same
      validation a manually-created entity of that type would fail.

## 5. Courses and digital products: storefront, not a rebuild

### 5.1 Reused entities, new discovery surface only

Consistent with what Phase 5 §5.1 anticipated, `Course` (Phase 5 §11) and
`DigitalProduct` (Phase 5 §5) are not duplicated here. The Marketplace browse
experience (§6) surfaces them alongside `Offering`-based freelance services
and `MarketplaceListing` categories — purchase, access-grant, and delivery
logic for courses and digital products remain exactly what Phase 5 built.

### 5.2 Acceptance criteria

- [ ] No new `Course`- or `DigitalProduct`-equivalent table is introduced by
      this phase — verified by their absence from any migration in this
      spec's implementation.
- [ ] A course or digital product purchased via the Marketplace browse UI
      produces the identical `PaymentTransaction`/access-grant records as a
      purchase made directly from the creator's own profile.

## 6. Marketplace browse experience

### 6.1 A query-time union, not a master table

Rather than migrating `Course`, `DigitalProduct`, `Offering`, and
`MarketplaceListing` into one unified table (a large, risky refactor of four
independently-evolved entities that this phase doesn't need), the browse
experience is a query-time union (or a dedicated search-index/read-model
built from all four sources for performance) across them. Each entity keeps
its own source-of-truth table and existing purchase logic; only the
discovery layer is new.

### 6.2 Category-specific ranking, not one global formula

Every earlier search integration in this series applied one ranking recipe
per entity (exact/fuzzy match, tie-broken by engagement or recency — Phase 1
§6.3, Phase 3 §16, Phase 4 §14, Phase 6 §10, Phase 7 §8) or one deliberate
exception (Phase 8 §9.1's soonest-first for events). Marketplace spans six
categories with genuinely different quality signals — install count for
apps, rating and sales volume for themes/templates, rating and
responsiveness for freelance services — and forcing one global formula
across all of them would produce worse results than in any single-entity
case so far. Recommend category-specific ranking configuration rather than
one shared formula, an explicit further departure from the single-formula
pattern, justified by Marketplace being the first genuinely multi-category
surface in this series.

### 6.3 Supplementary integration with global search

A combined "Marketplace" tab in the platform's existing global search
(reusing the established search infrastructure) supplements the dedicated
browse experience for users who search generally rather than browse by
category — the browse experience is the primary interface for this phase,
search integration is secondary.

### 6.4 Acceptance criteria

- [ ] Removing or renaming a field on any of `Course`/`DigitalProduct`/
      `Offering`/`MarketplaceListing` doesn't require a corresponding
      migration on a separate "marketplace master" table, because no such
      table exists.
- [ ] Each category's ranking can be tuned independently without affecting
      the others.

## 7. Reviews on marketplace listings

### 7.1 A second instance, not yet a generalization

`Business` already has a rated review system (`Review`/`ReviewResponse`,
Phase 4 §11). `MarketplaceListing` needs the same shape — a star rating plus
text, with one official seller response. Per the "three instances before
generalizing" discipline this series has applied consistently (Phase 6 §9,
Phase 7 §4.1), **this is only the second instance** of a rated-review
pattern, not the third — so `Review` is not generalized into a
subject-type-based table here. `MarketplaceListing` gets its own small,
parallel table instead:

```
MarketplaceListingReview
  id             uuid, pk
  listing_id     uuid, fk -> MarketplaceListing
  author_id      uuid, fk -> User
  rating         integer, 1-5
  body           string, 0-2000 chars
  created_at     timestamp
  updated_at     timestamp
  -- one per (listing_id, author_id), same "editable, not stackable" rule as Phase 4 §11.1

MarketplaceListingReviewResponse
  review_id      uuid, fk -> MarketplaceListingReview, unique
  responder_id   uuid, fk -> User  -- the individual seller, or a business team member with admin+ role
  body           string, 1-2000 chars
  created_at     timestamp
```

If a third rated-review need appears in a future phase, that's the point to
generalize `Review` the way Phase 7 generalized like/comment engagement —
not before.

### 7.2 Verified-purchase gating — a deliberate departure from Phase 4

Unlike Phase 4 Business Reviews, which are open to any user with no purchase
requirement (§11.1 of that spec, since a business as a whole has no single
"purchase" event to key off), `MarketplaceListingReview` requires a verified
`MarketplacePurchase` (or a completed installation, for a free listing)
before a review can be posted. This is cheap to enforce here — each listing
*is* an individually purchased or installed thing — and meaningfully reduces
fake-review risk for paid digital goods, apps, and themes in a way that
wasn't structurally available at the business level.

### 7.3 Acceptance criteria

- [ ] A user without a `MarketplacePurchase` (or install record, for free
      listings) cannot post a `MarketplaceListingReview` for that listing.
- [ ] `average_rating`/`review_count` on `MarketplaceListing` stay consistent
      with underlying review rows, updated transactionally, same pattern used
      for every other denormalized rating in this system.

### 7.4 Accessibility

Marketplace browse, listing, and checkout UI meet the accessibility standing
requirement from Phase 1 §7.3 — not restated in full per phase from here on.

## 8. Explicit open questions for product/legal sign-off

- **Apps category scope (§4.2)**: is widget-only acceptable for this phase's
  launch, or does the roadmap need reordering so Phase 10's developer
  platform lands before (or alongside) a fuller Apps marketplace?
- **Themes (§4.1)**: is token-based/reviewed-preset theming sufficient
  indefinitely, or does product want to commission the sanitization-strategy
  work Phase 1 named as the prerequisite for real custom CSS?
- **Marketplace commission percentage(s)** per category — likely distinct
  from Phase 5's creator fee and Phase 8's ticket fee; a finance decision,
  not an engineering default.
- **Review gate depth (§4.5)**: manual queue only, or automated
  content-safety/IP screening as well, particularly for apps and
  themes/templates?
- **Freelance escrow/milestones (§3.3)**: acceptable to launch without them,
  or does a freelance marketplace need dispute/escrow tooling from day one
  given real money and reputation are at stake per engagement?
- **Minimal IP-report path (§4.5, §7)**: given this is the first phase where
  third parties sell potentially derivative creative assets (themes,
  templates) at scale, is a lightweight "report this listing" action
  (feeding the same review queue) sufficient ahead of Phase 12/13's full
  Trust & Safety and copyright tooling, or does more need to be pulled
  forward now?

## 9. Suggested build sequence within Phase 9

1. Extend `Offering`/`AvailabilityRule`/`Appointment` to individual
   (`seller_user_id`) ownership (§3.2) — unlocks Freelance Services with no
   new entity, and is a prerequisite for step 2's checkout to cover both
   business and individual sellers uniformly.
2. `OfferingPurchase` + `PaymentTransaction` kinds `business_purchase`/
   `freelance_purchase` (§3.1) — resolves the Phase 4/5-flagged deferral.
3. `MarketplaceListing` + the pre-publish review gate (§4.3, §4.5) — the new
   entity for Themes/Templates/Apps, gate must ship with creation, not be
   added after launch (same discipline as Phase 4's business-claim gate).
4. `MarketplacePurchase` + `PaymentTransaction.kind = marketplace_purchase`.
5. `InstalledApp` + the app payload capability allowlist (§4.2) — sequence
   after step 3, since apps can't be installed before they can be listed.
6. `MarketplaceListingReview`/`MarketplaceListingReviewResponse` with
   verified-purchase gating (§7) — depends on step 4 existing.
7. Cross-entity browse experience with category-specific ranking (§6) —
   depends on steps 1–5 existing across all six categories; naturally lands
   after the underlying sellable things do.
8. Global search "Marketplace" tab (§6.3) — supplementary, sequence last.
