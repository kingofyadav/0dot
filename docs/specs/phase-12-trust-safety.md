# Phase 12 — Trust & Safety Spec

Status: Built (partial) — report/appeal/moderation/age-gating shipped; session management, 2FA, and account deletion landed later via `addendum-account-settings-hardening.md` and the mobile pro-upgrade; the privacy model is still binary (`Profile.isPrivate`), no granular per-post visibility. This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table, `../../README.md`, and `../foundations/TRUST_SAFETY.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md), [phase-10-developer-platform.md](phase-10-developer-platform.md), [phase-11-ai-platform.md](phase-11-ai-platform.md)

## 1. Purpose & Scope

Five prior phases each built their own ad hoc, scattered piece of review
workflow and explicitly said the real version belonged here: Phase 3's
community moderation with no report/appeal path (§13 of that spec), Phase
4's business-claim gate and no-dispute-path reviews (§3.3, §11), Phase 9's
marketplace listing review gate and its flagged-but-unbuilt "report a
listing" question (§4.5, §8), Phase 10's sensitive OAuth scope review
(§4.3), and Phase 11's AI `ModerationFlag` queue, explicitly built with only
a minimal review interface pending "Phase 12's fuller Trust & Safety scope"
(§4.1 of that spec). **The central architectural move in this phase is
unifying those five scattered pending-review mechanisms into one
case-management system and one reusable reporting entry point — without
retroactively migrating any of their existing schemas**, the same
non-retrofit discipline this series applied in Phase 9 §7.1 and Phase 11
§6.2.

**In scope:** a unified case-management layer over existing review gates; a
generic, reusable report action available on any reportable content; an
appeals process with a same-fairness constraint; account-level spam/bot risk
detection (distinct from Phase 11's content-level AI moderation); age
controls; transparency reporting.
**Out of scope:** arbitrating routine, intra-community moderation disputes
(that stays with each community's own governance — see §5.3); the
statutory DMCA notice-and-counter-notice workflow (Phase 13's scope — this
phase provides only the intake, see §7); general customer-service refund
handling that isn't fraud-flavored (Phase 5/finance's domain, see §6.3).

## 2. Success Criteria

- Every one of the five scattered review gates named in §1 is visible and
  workable from one Trust & Safety queue, without any of their own tables
  having been migrated or restructured to get there.
- Any user can report any reportable piece of content or account through one
  consistent action, not five different report buttons behaving five
  different ways.
- A user who disagrees with an enforcement action can appeal it, and that
  appeal is reviewed by someone other than the original decision-maker
  wherever staffing allows — this is treated as a real fairness requirement,
  not a nice-to-have.
- The reporter's identity is never disclosed to the person they reported,
  enforced at the same layer Phase 10 §5.1 insisted authorization logic be
  reused rather than risk a second, incorrect implementation.

## 3. Unified case management

### 3.1 One case-management layer, five existing sources, no retrofit

```
TrustSafetyCase
  id                        uuid, pk
  case_type                 enum: content_report | account_report | business_claim_review | marketplace_listing_review | oauth_scope_review | ai_moderation_flag | community_escalation | review_dispute
  subject_type               string  -- post, article, business, marketplace_listing, developer_app, community, review, user, etc.
  subject_id                 uuid
  reported_by                 uuid, fk -> User, nullable  -- null for system/AI-initiated or gate-driven cases (e.g. business_claim_review originates from the claimant's own submission, not a report)
  linked_ai_generation_id      uuid, fk -> AIGeneration, nullable  -- ties in Phase 11's audit substrate when the case originated from AI moderation or risk detection
  reason                       string, nullable
  status                       enum: open | in_review | resolved_upheld | resolved_dismissed | escalated
  assigned_to                   uuid, fk -> User, nullable  -- must hold TrustSafetyStaffRole, see §3.2
  resolution_notes               string, nullable
  created_at                     timestamp
  resolved_at                     timestamp, nullable
```

`TrustSafetyCase` does **not** replace `MarketplaceListing.status`,
`DeveloperAppScope`'s review gate, `ModerationFlag.status`, or any other
existing per-entity field — those remain each entity's actual source of
truth. Resolving a case updates the underlying entity's own field (e.g.
resolving a `marketplace_listing_review` case sets `MarketplaceListing.
status` to `active`/`rejected`, per Phase 9 §4.5). What this phase adds is
the **unified staff-facing workflow and audit trail** driving those
transitions consistently, replacing five different bespoke internal
processes with one — a real consolidation of the work, not a schema
rewrite of the systems that work feeds into.

### 3.2 Staff roles

```
TrustSafetyStaffRole
  user_id   uuid, fk -> User, unique
  role      enum: reviewer | senior_reviewer | admin
```

`senior_reviewer`+ is required to review an appeal of a `reviewer`-resolved
case (§4.2) and to access the CSAM-adjacent pipeline (Phase 11 §4.2),
which should be restricted to a smaller, specially authorized subset of
staff rather than every `reviewer` by default, given its legal sensitivity.

### 3.3 Acceptance criteria

- [ ] No existing table's status enum (`MarketplaceListing.status`,
      `ModerationFlag.status`, etc.) is altered or migrated by this phase —
      verified by absence of any such migration in the implementation.
- [ ] Every `TrustSafetyCase` resolution correctly updates the corresponding
      field on its underlying subject entity.
- [ ] `assigned_to` on any `TrustSafetyCase` must hold a
      `TrustSafetyStaffRole` row — a user without one cannot be assigned a
      case.

## 4. Report center

### 4.1 One generic report action, not five bespoke ones

```
Report
  id             uuid, pk
  reporter_id     uuid, fk -> User
  subject_type     string
  subject_id       uuid
  category         enum: spam | harassment | hate_speech | violence | sexual_content | ip_infringement | impersonation | fraud | other
  details          string, 0-2000 chars
  case_id           uuid, fk -> TrustSafetyCase
  created_at         timestamp
```

`Report` is kept distinct from `TrustSafetyCase` deliberately: it's the
immutable record of what a reporter actually submitted, preserved as-is even
as the case itself gets updated during review — the same "raw input record
separate from mutable working state" split Phase 11 used between
`AIGeneration` (raw) and `ModerationFlag` (working state). This one action
resolves Phase 3's explicitly-named gap ("no member-facing report button…
that's Phase 12," §13 of that spec) and Phase 9's flagged-but-unbuilt
"report a listing" question (§8 of that spec) with a single reusable
mechanism, available on any `subject_type` in the system, rather than a
separate bespoke report flow per content type.

### 4.2 Reporter anonymity is a safety property, not a UX default

`Report.reporter_id` is **never** disclosed to the subject of the report —
this is load-bearing (retaliation risk), not an incidental privacy choice,
and must be enforced at the same authorization/serialization layer Phase 10
§5.1 required the public API to reuse rather than risk reimplementing
incorrectly. A `TrustSafetyCase` view accessible to the reported-upon party
(if one is ever built, e.g. for transparency about "your content was
reported") must never include reporter identity, full stop.

### 4.3 Acceptance criteria

- [ ] Every reportable `subject_type` uses the same `Report` action — no
      content type gets a separately-coded reporting mechanism.
- [ ] No API response or notification visible to a report's subject ever
      includes `reporter_id`, directly or derivably.
- [ ] Filing a `Report` always creates exactly one `TrustSafetyCase`.

## 5. Appeals

### 5.1 Data model

```
Appeal
  id                uuid, pk
  original_case_id   uuid, fk -> TrustSafetyCase
  filed_by            uuid, fk -> User
  statement            string, 1-2000 chars
  status               enum: pending | upheld_original | overturned
  reviewed_by           uuid, fk -> User, nullable
  decided_at             timestamp, nullable
  created_at             timestamp
```

### 5.2 Different reviewer, where staffing allows

An appeal should be reviewed by someone other than whoever resolved the
original case — reviewing your own decision on appeal undermines the point
of having an appeals process at all. This is treated as a real fairness
requirement to design around (e.g. by requiring `senior_reviewer`+ for
appeal review, per §3.2), not merely an aspiration.

### 5.3 Scope boundary: platform actions, not routine community disputes

Platform-level appeals apply to platform-wide enforcement: account
suspension, AI-moderation-driven content removal, business-claim rejection,
marketplace listing rejection, OAuth scope rejection. **They do not extend
to routine community-level moderation** (a member muted or banned from one
`Community` by its own moderators, per Phase 3's `ModAction`, §13 of that
spec) — that stays within the community's own governance (escalate to the
community owner or another moderator of the same community) rather than
funneling every community's internal disputes to a central platform team.
This is a deliberate scope boundary, not an oversight: routing all
community-level disputes through platform T&S staff would be both a massive
volume problem and a real departure from the self-governance model Phase 3
established for communities.

A `community_escalation` case type exists specifically for the exception:
when what's at stake is platform-wide policy (not just a community's own
rules) even within a community's moderation action, that can be escalated
to platform staff — the boundary is "whose policy is actually implicated,"
not "did a community make a decision someone disagrees with."

### 5.4 Acceptance criteria

- [ ] An `Appeal`'s `reviewed_by` differs from the original case's
      `assigned_to` whenever a qualifying second reviewer is available.
- [ ] No `Appeal` can be filed against a routine community moderation action
      unless it's raised as a `community_escalation` case implicating
      platform-wide policy.

## 6. Spam and bot detection

### 6.1 Distinct from Phase 11's content-level AI moderation

Phase 11's `ModerationFlag` (§4 of that spec) classifies individual pieces
of *content*. This phase's spam/bot detection operates at the *account/
behavioral* level — velocity anomalies, duplicate-content patterns across
many posts, coordinated inauthentic behavior across clusters of accounts,
device-fingerprint clustering suggesting mass fake-account creation. A
different signal, not a duplicate of Phase 11's work.

```
AccountRiskSignal
  id                  uuid, pk
  user_id              uuid, fk -> User
  signal_type           enum: velocity_anomaly | duplicate_content | coordinated_behavior | device_fingerprint_cluster | other
  score                 decimal  -- 0.0-1.0
  ai_generation_id       uuid, fk -> AIGeneration, nullable  -- reuses Phase 11's audit substrate when ML-driven, rather than a second parallel log
  detected_at             timestamp
```

### 6.2 Automated action is scoped by reversibility, not banned outright

Phase 11 §4.1 established that automated moderation supplements, never
replaces, human review for ordinary content categories. This phase refines
that into a sharper, more useful rule: **the amount of autonomy an automated
system gets should match how reversible and low-harm its action is**, not a
blanket "always require a human" rule applied uniformly regardless of
stakes. Concretely:
- Reversible, low-harm responses to very high-confidence, well-understood
  patterns (e.g. temporarily rate-limiting an account that just performed
  200 follows in 10 seconds — textbook bot behavior) can be automated
  without a `TrustSafetyCase` and human pre-approval.
- Irreversible or high-harm actions (permanent ban, content deletion, losing
  payout access) always route through a `TrustSafetyCase` for human
  decision — no automated shortcut, same as Phase 11 §4.1's rule for
  ordinary content categories.
- The Phase 11 §4.2 CSAM-pattern exception (mandatory legal reporting,
  its own dedicated pipeline, no standard notification) is untouched by
  this phase and remains categorically separate from everything in §6.

### 6.3 Fraud-flavored disputes vs. ordinary refunds

A `Report(category = fraud)` can create a `TrustSafetyCase` alongside
whatever separate financial dispute/refund process Phase 5 handles — but
ordinary "I didn't like this course, I want a refund" is not a Trust &
Safety matter and should not be routed into this system. The boundary is
whether deception/abuse is alleged, not merely dissatisfaction.

### 6.4 Acceptance criteria

- [ ] No `AccountRiskSignal`-triggered automated action is irreversible
      (permanent ban, content deletion, payout suspension) without a
      resolved `TrustSafetyCase` behind it.
- [ ] `AccountRiskSignal` rows reuse `AIGeneration` for audit when
      ML-derived, rather than a second, parallel audit log.

## 7. IP-infringement intake — not the DMCA workflow

`Report(category = ip_infringement)` is the intake mechanism for copyright
complaints, creating a `TrustSafetyCase`, but the statutory
notice-and-counter-notice workflow (specific deadlines, safe-harbor
requirements, a designated agent) is explicitly **Phase 13's scope**, named
in the roadmap as its own phase for exactly this reason. This phase should
not build a parallel, legally-incomplete copyright process — it only needs
to ensure the generic report/case pipeline can hold an
`ip_infringement`-categorized case that Phase 13 can extend with the
DMCA-specific fields and workflow it needs, without restructuring what this
phase already built.

## 8. Age controls

### 8.1 Data model

```
User gains:
  date_of_birth     date, nullable
  age_verified_at   timestamp, nullable  -- set if a stronger verification step (e.g. ID check) was completed beyond self-reported date of birth
```

### 8.2 A real backward-compatibility gap, named explicitly

Every account created since Phase 1 was created without collecting date of
birth — this phase cannot simply assume existing accounts have it.
Recommended approach: prompt existing users for date of birth at next login
rather than backfilling it silently or guessing, and treat an unknown DOB as
"apply default protective restrictions until provided," not "assume adult."
This mirrors how earlier phases have named real migration/rollout realities
rather than treating a schema addition as if it were already populated
(Phase 8's `CommunityEvent` migration, Phase 11's `FileAsset` new-uploads-
only scoping).

### 8.3 A gap this phase should close in Phase 5, not just add generally

Phase 5's `CreatorPayoutAccount` (§3.1 of that spec) delegated identity
verification/KYC entirely to the payment processor but never addressed a
minimum age for holding a payout account at all — payout accounts carry tax
and financial-contract implications that plausibly warrant a higher age
floor than general platform signup. This phase should tie age verification
into Phase 5's payout onboarding gate, not just add a general-purpose field
that Phase 5's flow never checks. Whether this applies retroactively to
already-active payout accounts or only new ones is flagged in §10.

### 8.4 Acceptance criteria

- [ ] An account with no `date_of_birth` on file receives the default
      protective restriction set until one is provided — not treated as an
      adult account by default.
- [ ] `CreatorPayoutAccount` onboarding (Phase 5 §3.1) checks age eligibility
      as part of its gate, not independently of it.

## 9. Transparency reports

A scheduled aggregation over `Report`/`TrustSafetyCase`/`Appeal` data,
published periodically — mostly a reporting/export job over existing data,
not a new core entity, in the same "maintained deliverable, not primarily a
data-modeling concern" category as Phase 10's SDKs (§10 of that spec).
Recommended reportable dimensions: case volume by category, resolution type
breakdown, and — importantly for genuine accountability rather than a
one-sided "look how much we removed" report — the **appeal overturn rate**,
which signals whether the enforcement process itself is trustworthy, not
just how active it is. Exact publication cadence and the tension between
transparency and revealing exploitable detection thresholds to bad actors
are flagged in §10, not resolved here.

### 9.1 Accessibility

Report-filing, appeal, and case-status UI meet the accessibility standing
requirement from Phase 1 §7.3 — not restated in full per phase from here on.

## 10. Explicit open questions for product/legal sign-off

- **Community-dispute escalation boundary (§5.3)**: is "platform T&S doesn't
  arbitrate routine community disputes" the right line, or does product
  want broader oversight of community moderation than this spec recommends?
- **Age-verification backfill (§8.2)**: what grace period applies to
  existing accounts, and what exactly is the default restriction set for an
  account with unknown age in the interim?
- **Payout account age floor (§8.3)**: does this apply retroactively to
  already-active `CreatorPayoutAccount`s, or only newly created ones?
- **Automated action thresholds (§6.2)**: exact confidence/velocity
  thresholds for reversible automated actions need real operational/data
  science tuning, not an engineering default invented here.
- **Transparency report cadence and granularity (§9)**: how to balance
  genuine transparency against publishing enough detail that bad actors
  could reverse-engineer and evade detection thresholds.
- **CSAM-pipeline staffing (§3.2)**: exact training/authorization policy for
  the restricted staff subset needs legal/HR input, not just a role enum.

## 11. Suggested build sequence within Phase 12

1. `TrustSafetyCase` + `TrustSafetyStaffRole` (§3) — the backbone every
   other piece of this phase attaches to, and the first step precisely
   because it requires no changes to any of the five existing systems it
   will end up unifying.
2. `Report` + the generic report action available across every reportable
   `subject_type` (§4) — the first real new user-facing entry point in this
   phase.
3. Wire the five existing pending-review gates (business claim, marketplace
   listing, OAuth sensitive scope, AI `ModerationFlag`, and community
   escalations) into `TrustSafetyCase` as the unified staff queue, with no
   changes to any of those tables' own status fields (§3.1) — this is the
   phase's central consolidation payoff, sequenced early so the rest of the
   phase builds on a working unified queue.
4. `Appeal` + the different-reviewer requirement + the community-dispute
   scope boundary (§5).
5. `AccountRiskSignal` + the reversibility-scoped automated-action policy
   (§6), reusing Phase 11's `AIGeneration` audit substrate.
6. Age controls: `User.date_of_birth`/`age_verified_at` + the existing-
   account backfill prompt + the `CreatorPayoutAccount` gate tie-in (§8).
7. IP-infringement `Report` category wired to `TrustSafetyCase`, explicitly
   left un-extended pending Phase 13's DMCA workflow (§7).
8. Notification producers (`report_acknowledged`, `case_resolved`,
   `appeal_decided`) with reporter-anonymity enforcement verified at the
   serialization layer (§4.2) — sequence after steps 1–4 exist, since these
   notifications describe their outcomes.
9. Transparency reporting (§9) — depends on real case volume existing to
   aggregate; naturally lands last.
