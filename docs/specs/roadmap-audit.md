# Roadmap Completeness Audit

Status: Resolved — see §5 for how each finding was closed
Scope: Cross-checks the 15 phase specs against the *entire* roadmap document
— not just the Phase 1–15 feature bullets (which are fully covered), but
the Revenue Model, Core Principles, Platform URLs, and Future Modules
sections, which were never individually audited while writing the specs
one phase at a time.

## 1. What's confirmed complete

- All 15 numbered phases have a spec in `docs/specs/`, each cross-linking
  the others, each phase's own roadmap bullets accounted for and mapped to
  concrete data models, acceptance criteria, and open questions.
- Every roadmap feature bullet under Phase 1–15 traces to at least one
  spec. Deliberate scope exclusions (e.g. Phase 4's cross-business job
  board, Phase 9's full app ecosystem) are named as such, not silently
  dropped.
- `ROADMAP.md` in the repo matches the source document verbatim (364
  lines, no drift).

## 2. Gaps found — items in the roadmap that no phase spec addresses

These aren't Phase 1–15 feature bullets (which were all covered
one-by-one) — they're bullets from the roadmap's *other* sections, which
fell through the cracks precisely because each phase spec was written
against its own bullet list, not against the whole document.

### 2.1 Custom domains (Revenue Model)

Zero mentions across all 15 specs. Mapping a personal domain
(`yourname.com`) or a business/organization domain onto a 0dot profile is a
named revenue line but was never designed. It plausibly touches Phase 1
(personal `@username` profiles), Phase 4 (business pages), and Phase 14
(organizations already have a `domain` field for SSO purposes, per that
spec §2.1 — a natural, unplanned point of overlap with this gap).

### 2.2 Premium profiles (Revenue Model)

Zero mentions. This surfaces something more interesting than a missing
bullet: **it implies a payment topology this roadmap has never built.**
Every payment system specified so far (Phase 5's `PaymentTransaction`/
`CreatorPayoutAccount`, extended in Phase 8 for tickets and Phase 9 for
business/freelance commerce) is a *facilitator* model — money flows from a
fan/buyer to a creator/seller, with 0dot taking a cut. A "premium profile"
subscription is a **direct-to-platform** charge — money flows from a user
straight to 0dot itself, with no payee on the other end. Nothing in Phases
1–15 has plumbing for that simpler, different flow; it would currently have
to be awkwardly modeled as a `CreatorPayoutAccount` with 0dot as its own
payee, which is the wrong shape for what is really a plain SaaS
subscription.

### 2.3 API usage as a paid tier (Revenue Model)

Partial gap. Phase 10 built the metering infrastructure (`§5.3`'s
aggregated rolling-window usage counters, rate-limit tiers keyed to app
trust level) but never a *billing* model layered on top of it — the
counters exist, nothing charges against them. Closing this is small: it's
a pricing/plan concept added to `DeveloperApp`, not new infrastructure.

### 2.4 Trending (Platform URL: `0dot.in/trending`)

Real gap, not just a missing mention. `trending` appears only as a
reserved word in Phase 1's namespace-collision list (§3.2) — it was never
designed as an actual feed. Phase 2 (§6.1) defined `Home` (follow-based) and
`Explore` (the Phase 1 chronological global feed) but nothing
velocity/engagement-ranked. A named top-level URL currently has no feature
behind it.

### 2.5 General UI accessibility (Core Principle: "Accessibility")

Real gap. Phase 11 built *AI*-assisted accessibility — generated alt-text
and captions (§6 of that spec) — but the roadmap's Core Principle is
broader: keyboard navigation, screen-reader-compatible UI, color-contrast/
WCAG conformance for the actual interface. Unlike security ("sanitize all
user content," "rate-limit every write endpoint"), which this series
restated as a standing cross-cutting requirement in nearly every phase,
accessibility was never given that same "applies to every phase, every
time" treatment — it only ever showed up as one Phase 11 feature.

### 2.6 Advertising (Revenue Model) — confirmed non-gap

Zero mentions, but the roadmap itself marks this "(optional)" — its
absence is consistent with that, not an oversight. Noted for completeness,
not flagged as something to fix.

## 3. A source-document inconsistency (not a spec gap)

The roadmap's own **"Recommended build order"** section (Identity →
Link hub → Feed → Follow → Communities → Messaging → Business profiles →
Creator monetization → Search & discovery → Developer platform → AI
features → Enterprise capabilities) is a 12-item list that doesn't cover
the same ground as the 15-phase structure the rest of the document
describes — it never mentions Portfolio, Knowledge, Events, Marketplace,
Trust & Safety, Copyright/IP, or Mobile Apps at all, and its ordering
(e.g. "Search & discovery" as item 9, well after several phases that
already depend on search) doesn't fully match the Phase 1–15 sequence
either. This reads like an earlier, shorter planning pass that predates the
full 15-phase breakdown and was never reconciled with it. Flagging this
rather than silently reconciling it, since it's a question about your
source document's intent, not something a spec-writing pass should resolve
on its own.

## 4. Recommended next step

Items 2.1–2.4 are each small, well-scoped additions to existing phases (or
one short new addendum covering all three payment/domain items together,
given 2.1 and 2.2 are related). Item 2.5 isn't a feature to spec so much as
a standing checklist item this series should have been restating alongside
security/rate-limiting all along. Item 3 just needs your call on which
list is authoritative.

## 5. Resolution

- **2.1 Custom domains, 2.2 Premium profiles, 2.3 API usage billing** — all
  three closed in one new
  [addendum-platform-billing.md](addendum-platform-billing.md), grouped
  together since they share the same root cause: a direct-to-platform
  billing topology this roadmap had never built (facilitator payments only,
  via Phase 5's `PaymentTransaction`). Includes a shared `DomainVerification`
  primitive so `CustomDomain` and Phase 14's `Organization.domain` don't each
  reimplement DNS verification independently.
- **2.4 Trending** — closed as new §6.2 in
  [phase-2-social-platform.md](phase-2-social-platform.md), as a
  velocity-ranked third feed distinct from `Home`/`Explore`, with its own
  denormalized `trending_score` and a build-sequence entry.
- **2.5 General UI accessibility** — closed as a new standing requirement in
  [phase-1-foundation.md](phase-1-foundation.md) §7.3 (renumbering that
  spec's Privacy/open-questions subsections to §7.4/§7.5 — verified no other
  spec cross-referenced the old numbers before renumbering), with a
  one-line echo added to every one of Phases 2–15's own cross-cutting
  section, the same restatement pattern already used for the
  rate-limiting/sanitization requirement.
- **§3's build-order inconsistency** — resolved per your direction: the
  Phase 1–15 structure is authoritative. `ROADMAP.md`'s "Recommended build
  order" section now carries an explicit superseded-by note pointing back
  here, rather than being silently rewritten or left to conflict with the
  fuller structure.
