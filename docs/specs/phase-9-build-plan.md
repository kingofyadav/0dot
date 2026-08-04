# Phase 9 — Marketplace: build plan (saved for later)

> Companion to the actual spec at
> [phase-9-marketplace.md](phase-9-marketplace.md); this is the
> implementation plan, not the spec itself. Built across the suggested
> build sequence (§9 steps 1–8) in this codebase's now-standard order —
> extend existing entities first, add the one genuinely new entity next,
> browse/search last since both depend on every sellable category already
> existing.

## 1–2. Freelance services + Offering/AvailabilityRule/Appointment checkout (spec §3)

`Offering`/`AvailabilityRule`/`Appointment` each gained `sellerUserId`
(nullable), `businessId` became nullable on all three — the same two-way
owner XOR idiom `Link` (Phase 4 §3.2) and `CreatorPayoutAccount` (Phase 8
§5.2) already established, resolved once in `resolveOfferingOwner`
(`src/lib/offerings.ts`) and reused by every Offering/AvailabilityRule/
Appointment call site rather than re-implemented per entity. `purchaseOffering`
(`src/app/actions/offerings.ts`) writes a `business_purchase`- or
`freelance_purchase`-kind `PaymentTransaction` depending on which side of
the XOR is set — no new ledger table, `recordPaymentTransaction` exactly as
Phase 5/8 left it. An individual seller without an `active`
`CreatorPayoutAccount` is gated at charge time the same way Phase 5 §3.5
gates creators generally.

Public surface: `/[username]/services` — the "self" mirror of
`/b/[slug]/store` + `/b/[slug]/appointments` merged into one page (an
individual's catalog doesn't need the two-tab split a business does), reusing
`OfferingBuyButton`/`RequestSlotButton` as-is.

## 3–4. `MarketplaceListing` + review gate + `MarketplacePurchase` (spec §4)

The one genuinely new entity this phase needs, for the three categories with
no existing home: Themes, Templates, Apps. `createMarketplaceListing`
(`src/app/actions/marketplace.ts`) always writes `status: "pending_review"`
— there is no direct-to-`active` path, same discipline as Phase 4's business
claim gate and Phase 3's restricted-community join. `validateListingPayload`
(`src/lib/marketplace.ts`) is the write-time enforcement of §4.6's literal
criteria: a `theme` payload can only ever be the fixed
`accent`/`accentStrong`/`accentSoft` token set Phase 1 §3.6 already defined
(never custom CSS/HTML), an `app` payload can only reference an
oEmbed-style allowlisted provider domain (`EMBED_PROVIDERS`, widened by
adding an entry, never by loosening the per-listing check), and a
`template` payload is opaque JSON capped by size — its actual fields are
never trusted directly, they only ever reach a real entity through that
entity's own creation form and validation (§4.4), never a bulk-insert
bypass.

Editing an already-reviewed listing (`updateMarketplaceListing`) sends it
back to `pending_review` rather than leaving an approved row silently
editable — otherwise the gate could be bypassed by getting a benign listing
approved once, then editing its payload after the fact.

`purchaseMarketplaceListing` follows the same nullable-price-means-free
shape `Offering`/`DigitalProduct`/`Ticket` already use: a free listing skips
the payment backbone entirely (still writes a `MarketplacePurchase` row —
ownership, not payment, is the thing being recorded), a paid one reuses
`recordPaymentTransaction` with `kind: "marketplace_purchase"`.

### Admin review queue (`/admin/marketplace`)

Mirrors `/admin/businesses` (`isPlatformAdmin`-gated, only `pending_review`
rows are actionable). One deliberate departure: a rejected
`MarketplaceListing` is kept as `status: "rejected"`, not deleted — unlike a
rejected business claim (whose core risk is impersonation, with no
legitimate reason for the row to persist), a rejected listing may already
carry purchase/review history from an earlier approved version (the
edit-sends-back-to-pending_review path above), so deleting it would destroy
that record for a moderation outcome that's worth keeping, not erasing.

## 5. `InstalledApp` (spec §4.2–§4.3)

A three-way installer XOR (profile / business / community) — wider than the
two-way seller XOR above because a widget can attach to any of the three,
unlike selling, where communities are deliberately excluded from commerce
entirely (Phase 8 §5.2's precedent). `installApp` requires an existing
`MarketplacePurchase` before installing a priced app, but not a free one —
a free app can be installed directly, and that install record is itself
what later satisfies the review-gate's "or a completed installation, for a
free listing" clause (§7.2). Guarded against installing the same app twice
to the same target (a check the initial pass was missing — added this
session after tracing the install flow end-to-end).

## 6. `MarketplaceListingReview`/`MarketplaceListingReviewResponse` (spec §7)

Second instance of the rated-review pattern after Business's
`Review`/`ReviewResponse` (Phase 4 §11) — per this series' "three instances
before generalizing" discipline, not yet folded into a subject-type table.
Verified-access gating (`hasVerifiedListingAccess`, `src/lib/marketplace.ts`)
is the one deliberate departure from Phase 4 Business Reviews (which are
open to anyone, since a business has no single purchasable "thing" to key
off): a `MarketplaceListingReview` requires a `MarketplacePurchase` or, for
a free listing, a completed `InstalledApp` install. That check is exported
from the shared lib (not left private to the write action) specifically so
the detail page and the write action agree on the same rule — the page
decides whether to *show* the review form using the identical function the
server uses to decide whether to *accept* one, rather than the UI guessing.

## 7. Browse experience (spec §6)

`src/lib/marketplace-browse.ts` — a query-time union across `Course`,
`DigitalProduct`, freelance `Offering` (`sellerUserId` set; business-catalog
Offerings are Phase 4's Store, not one of the roadmap's six Marketplace
categories), and `MarketplaceListing` (three categories). No master table:
each fetcher queries its own source-of-truth directly, shared between `/m`
and the search tab (§8 below) only to avoid two copies of six queries, not
because a unified schema exists.

Per §6.2, ranking is genuinely category-specific rather than one global
formula: themes/templates by rating then sales volume, apps by install
count, courses/digital-products/freelance-services by sales volume (the
closest available proxy — `Offering` has no rating field of its own, since
per §7.1's "second instance, not third" discipline one wasn't added here;
noted in the lib's comment as a named departure from the spec's literal
"rating and responsiveness" phrasing, not a silent gap). The combined "All"
tab interleaves every category's already-ranked results by recency only —
a neutral default for mixing scores that aren't on the same scale (an
app's install count vs. a course's sale count), not a seventh formula.

Routes: `/m` (browse, category tabs — All / Theme / Template / App / Course
/ Digital product / Freelance service, same tabbed shape `/search` already
established for its own multi-entity tabs), `/m/new` (create a
Theme/Template/App listing — Courses/Digital products/Freelance services are
each created from their own existing surface, per §5.1 this phase adds no
new creation path for them), `/m/[id]` (detail: purchase-or-free-claim,
install/uninstall for apps, reviews, and — behind `canManageListing` — an
inline edit form and archive control, no separate manage route, consistent
with this codebase's edit-inline-on-detail-page convention).

## 8. Search integration (spec §6.3)

A `marketplace` tab added to `src/app/search/page.tsx`, reusing
`fetchAllMarketplaceCategories` from the browse lib — supplementary to the
dedicated `/m` browse experience per the spec's own explicit "browse is
primary, search is secondary" framing, not a second, divergent ranking
implementation.

## Open questions carried forward unresolved (spec §8)

Commission percentages, review-gate depth (manual-only vs. + automated
content-safety screening), freelance escrow/milestones, and a minimal
IP-report path are all explicitly out of engineering scope for this build —
flagged in the spec itself as product/legal decisions, not defaulted here.
