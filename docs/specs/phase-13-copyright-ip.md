# Phase 13 — Copyright & IP Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md), [phase-11-ai-platform.md](phase-11-ai-platform.md), [phase-12-trust-safety.md](phase-12-trust-safety.md)

## 1. Purpose & Scope

Phase 12 explicitly deferred the statutory DMCA notice-and-counter-notice
workflow here (§7 of that spec), and several earlier phases each handled one
instance of "legally required behavior that varies by jurisdiction" as a
one-off, phase-specific decision: recording consent (Phase 8 §6.3),
newsletter consent regimes (Phase 5 §10.2), minimum age (Phase 12 §8). This
phase's own roadmap bullet — "compliance with applicable laws in each
country" — is the fifth instance of exactly that pattern, which is past the
threshold this series has used elsewhere to justify generalizing rather
than continuing to hardcode assumptions one at a time (§9).

This phase also surfaces a real naming tension worth stating up front: the
roadmap calls the statutory takedown workflow "DMCA," which is specifically
US law. The same phase's own "compliance in each country" bullet implies
this can't just be a US-only mechanism if 0dot operates elsewhere — the
spec below builds the DMCA workflow as a first, fully statute-compliant
implementation, while keeping the underlying model general enough for a
meaningfully different regime (e.g. the EU's) to be added later without a
redesign (§4.1).

**In scope:** version history for content types that don't have it yet;
copyright declarations; the DMCA takedown/counter-notice workflow with its
repeat-infringer safe-harbor requirement; watermarking; ownership records;
a generalized jurisdiction-rule mechanism; 0dot's own trademark protection.
**Out of scope:** a fully-built second (e.g. EU) notice-and-action regime at
launch (the model supports adding one later, see §4.1); real chain-of-title
legal infrastructure beyond a simple ownership-transfer log (§7).

## 2. Success Criteria

- Every user-authored content type that matters for copyright disputes —
  not just wikis — has retained edit history, closing a real gap this spec
  identifies rather than assumes doesn't exist.
- The DMCA workflow is legally complete enough to preserve the platform's
  safe-harbor protection, including the repeat-infringer policy that safe
  harbor is conditioned on — this is treated with the same seriousness this
  series has given other launch-blocking legal items (Phase 8's recording
  consent, Phase 11's CSAM pipeline).
- A jurisdiction-dependent rule (recording consent, minimum age, notice
  regime) is configuration, not a hardcoded assumption baked into each
  feature that happens to need one.
- A DMCA complainant's identity is correctly *not* anonymized to the alleged
  infringer, a deliberate and legally-required departure from Phase 12's
  general reporter-anonymity principle, not an accidental inconsistency.

## 3. Closing the version-history gap: `ContentRevision`

### 3.1 Wikis have it; Posts and Articles don't

Phase 3's `WikiPage`/`WikiRevision` (§10 of that spec, extended in Phase 7
§5.1) already gives wikis, documentation, and books full append-only
revision history. Neither `Post` (Phase 1) nor `Article` (Phase 7) has any
edit-history tracking at all — both can be silently edited or deleted with
no retained record. If "version history" is meant to support copyright/
ownership-proof claims, that has to cover all user-authored content, not
just wiki-shaped content.

### 3.2 Generalizing at exactly three instances, not before

`WikiRevision` is the first instance of a revision-tracking pattern. This
phase needs it for both `Post` and `Article` at the same time — instances
two and three arriving together, which is exactly the threshold this series
has used elsewhere to justify generalizing rather than building a second
bespoke table and generalizing later (Phase 7 §4.1's reasoning for
`Reaction`/`Comment`). A shared table is used going forward:

```
ContentRevision
  id             uuid, pk
  subject_type   enum: post | article
  subject_id     uuid
  body_snapshot  text  -- a full snapshot per revision, not a diff — matching WikiRevision's own approach
  edited_by      uuid, fk -> User
  created_at     timestamp
```

`WikiPage`/`WikiRevision` is **not** retrofitted onto this table — same
non-retroactive-migration discipline this series has applied consistently
(Phase 9 §7.1, Phase 11 §6.2). It already works; migrating it isn't
necessary to close the actual gap, which is Post and Article having no
history at all.

### 3.3 Acceptance criteria

- [ ] Editing a `Post` or `Article` body creates a `ContentRevision` row
      before the change is visible, not after.
- [ ] `WikiPage`/`WikiRevision` is untouched by this phase.

## 4. DMCA takedown and counter-notice workflow

### 4.1 Built on Phase 12's case management, not a parallel system

```
DMCATakedownNotice
  id                                    uuid, pk
  trust_safety_case_id                  uuid, fk -> TrustSafetyCase  -- reuses Phase 12's unified case queue directly, resolving the forward reference that spec's §7 left open
  complainant_name                       string
  complainant_contact                     string
  copyrighted_work_description             string
  infringing_content_subject_type           string
  infringing_content_subject_id              uuid
  good_faith_statement_accepted               boolean  -- statutory attestation; exact wording is legal's to draft, not engineering's (§9)
  accuracy_perjury_statement_accepted          boolean  -- statutory "under penalty of perjury" attestation
  signature                                     string
  submitted_at                                   timestamp
  status                                          enum: received | content_removed | invalid_rejected

DMCACounterNotice
  id                             uuid, pk
  original_notice_id              uuid, fk -> DMCATakedownNotice
  subject_user_id                  uuid, fk -> User
  good_faith_statement_accepted      boolean  -- statutory "good faith belief the material was removed as a result of mistake or misidentification"
  consent_to_jurisdiction              boolean  -- statutory requirement
  signature                             string
  submitted_at                            timestamp
  restoration_eligible_at                  timestamp  -- submitted_at + the statutory waiting period (10-14 business days under US DMCA), content restored automatically at this point unless the complainant has filed suit and notified the platform
  status                                    enum: received | content_restored | notice_forwarded_awaiting_lawsuit
```

Both attestation booleans correspond to specific statutory language (17
U.S.C. § 512) — the exact wording shown to complainants and counter-
notifiers must be drafted/reviewed by legal, not invented by engineering;
these fields exist to record that the required attestation was made, not to
define what it says.

### 4.2 A DMCA complainant is not anonymous — a deliberate contrast with Phase 12

Phase 12 §4.2 made reporter anonymity a load-bearing safety property for its
general `Report` mechanism. **DMCA is the opposite by statutory
requirement**: the complainant's contact information must be available to
the alleged infringer so they can respond and, if filing a counter-notice,
consent to jurisdiction — this is due process the statute requires, not an
optional design choice. This is a deliberate, legally-mandated departure
from Phase 12's general principle, not an inconsistency — a naive
implementation that reused Phase 12's anonymity logic here would actually
be non-compliant, which is exactly why this is worth stating explicitly
rather than assumed to follow the same pattern as every other report type.

### 4.3 Repeat-infringer policy is a safe-harbor condition, not a nicety

Maintaining DMCA safe-harbor protection **legally requires** the platform
to adopt and reasonably enforce a repeat-infringer termination policy —
failing to do so can void safe harbor entirely, exposing the platform to
direct copyright liability for user-uploaded content. This is not a
discretionary Trust & Safety nicety; it's a condition of the statutory
protection this whole workflow exists to obtain, and is given the same
level of seriousness this series has given other legal must-haves (Phase 8
§6.3's recording consent, Phase 11 §4.2's CSAM pipeline).

```
User gains:
  dmca_strike_count   integer, default 0  -- incremented on each valid, unrebutted takedown against content they posted
```

An enforcement threshold (e.g. account suspension after N strikes) must
exist and actually be enforced — not merely tracked as a number nobody
acts on. Exact threshold is a legal/policy decision (§9), not invented here.

### 4.4 Two tiers: a casual report vs. a formal legal notice

Phase 12's `Report(category = ip_infringement)` remains the lightweight
initial flag ("this looks stolen"); `DMCATakedownNotice` is the heavier,
statute-shaped formal notice a rights-holder files when they want the
actual legal takedown mechanism invoked. A `Report` can be optionally
escalated into a formal `DMCATakedownNotice` if the reporter wants to
pursue it, rather than requiring every casual report to carry full
statutory attestation fields up front.

### 4.5 Acceptance criteria

- [ ] `DMCACounterNotice.restoration_eligible_at` triggers automatic
      restoration unless the complainant has filed suit and notified the
      platform before that time — restoration is not left to manual staff
      follow-through alone.
- [ ] `DMCATakedownNotice.complainant_contact` is disclosed to the subject
      of a counter-notice — verified as a deliberate exception to Phase 12's
      anonymity default, not accidentally blocked by reused logic.
- [ ] `dmca_strike_count` crossing the configured threshold actually
      triggers an enforcement action (via Phase 12's case/enforcement
      mechanisms), not just an incremented counter with no consequence.

## 5. Copyright declarations

### 5.1 Data model

```
ContentLicense
  subject_type    string  -- broad: post, article, project, marketplace listing, business content, etc.
  subject_id      uuid
  license_type    enum: all_rights_reserved | cc_by | cc_by_sa | cc_by_nc | cc_by_nd | cc0 | custom
  custom_terms    string, nullable  -- required if license_type = custom
  declared_at     timestamp
  primary key (subject_type, subject_id)
```

`all_rights_reserved` is the default in the absence of any declaration —
standard copyright law already grants creators full rights without an
explicit statement; this feature is opt-in for creators who want to grant
*more* permissive terms, not a requirement to declare anything at all.
Changing a declared license going forward does not retroactively revoke
rights already granted to people who used the content under the prior
terms — a real legal nuance worth stating even though it isn't something
software can fully enforce on its own; it's a policy statement shown to the
user changing their license, not a technical guarantee.

## 6. Watermarking

### 6.1 Built on Phase 11's `FileAsset`, not a separate media pipeline

```
FileAsset (Phase 11) gains:
  watermark_enabled   boolean, default false
  watermarked_url      string, nullable  -- generated asynchronously, same "never computed synchronously during a request" principle already applied to Phase 6 §5.2's metadata sync and Phase 11 §6.3's accessibility captions
```

Watermarking is opt-in per upload. The original, unwatermarked file remains
the asset the owner and any legitimately-paying buyer receive (e.g. Phase 5
§5.3's signed-URL-gated digital product delivery continues serving the
clean original to a verified purchaser); the watermarked version is what's
shown in preview/non-owner contexts — a marketplace listing preview, for
instance, can show a watermarked sample while the actual paid download
remains untouched.

### 6.2 Acceptance criteria

- [ ] Enabling `watermark_enabled` does not alter the original `FileAsset`
      content — `watermarked_url` is a derived, separate artifact.
- [ ] A verified purchaser (per Phase 5 §5.3's access check) receives the
      clean original, not the watermarked preview version.

## 7. Content ownership records

A lightweight record of ownership changes, distinct from just trusting
whatever an entity's current `owner_id`/`author_id` field says at any given
moment:

```
OwnershipTransfer
  id              uuid, pk
  subject_type     string
  subject_id       uuid
  from_user_id      uuid, fk -> User, nullable
  to_user_id         uuid, fk -> User
  transferred_at      timestamp
  reason              string, nullable  -- e.g. "sale", "account closure reassignment"
```

This is intentionally minimal — a historical log, not a full chain-of-title
legal system with transfer-approval workflows. Whether a transfer needs
both parties' explicit consent (versus one party recording a transfer
unilaterally) is flagged as an open question (§9) rather than decided here.

## 8. Trademark protection for the 0dot.in brand

### 8.1 Mostly a legal/operational function, with one concrete technical piece

Registering and enforcing 0dot's own trademark is largely non-technical
work (registration, monitoring for external infringing use, cease-and-
desist as needed). The software-relevant piece: the shared reserved-word
list used since Phase 1 §3.2 — already reused across usernames, community
slugs (Phase 3 §3.2), business slugs (Phase 4 §3.1), project slugs (Phase 6
§3.2), and event slugs (Phase 8 §3.3) — must actually include 0dot's own
brand terms and common confusable variants, and must be **actively
maintained** as new confusable terms are identified, not treated as a
static list frozen at Phase 1. This is flagged as an ongoing operational
responsibility, not a one-time technical gate satisfied by shipping this
phase.

### 8.2 Relationship to Phase 4's business-impersonation gate

Phase 4 §3.3's business-claim/verification gate cited this exact roadmap
phase as its underlying justification for existing at all — protecting
*other* businesses' trademarks from impersonation on the platform. That
gate is about third-party marks; this section is specifically about
0dot.in's own. Both matter, but they're not the same concern, and this
phase doesn't need to rebuild Phase 4's gate — only to make sure 0dot's own
name is itself included in the reserved-word list that gate (and every
other namespace) already checks against.

## 9. Generalizing jurisdiction-dependent rules

### 9.1 A fifth instance of the same recurring need

Recording consent varying by jurisdiction (Phase 8 §6.3), minimum age of
majority (Phase 12 §8), newsletter consent regimes (Phase 5 §10.2), and now
this phase's own DMCA-vs-other-countries' notice regimes (§4.1) are all
instances of "legally required behavior that varies by country," each so
far handled as a one-off, phase-specific hardcoded assumption. That's now
five occurrences of the same shape — past the threshold this series uses
elsewhere to generalize rather than keep hardcoding. Since this phase's own
roadmap bullet is literally "compliance with applicable laws in each
country," it's the natural point to introduce the shared mechanism:

```
JurisdictionRule
  id            uuid, pk
  region        string  -- ISO country code or broader region grouping
  rule_type     enum: recording_consent | minimum_age | newsletter_consent_regime | copyright_notice_regime | other
  parameters    jsonb  -- rule-specific configuration, e.g. {consent_required: "all_party"}, {minimum_age: 16}, {regime: "eu_dsa"}
  updated_at    timestamp
```

This does not need to be exhaustively populated at launch — it needs to
exist as a real extension point, so the next jurisdiction-specific
requirement this platform discovers (and there will be a next one) is a
configuration change, not a new hardcoded assumption requiring its own code
change and its own spec-writing exercise. Retrofitting Phase 5/8/12's
already-shipped jurisdiction-dependent logic to read from this table is
worth doing where feasible but is not required to be complete for this
phase to ship — those features already work; this table is primarily for
what comes next, including this phase's own DMCA-vs-other-regimes question.

### 9.2 Acceptance criteria

- [ ] `JurisdictionRule` exists and is queried by at least this phase's own
      copyright-notice-regime logic (§4.1) — proving the extension point
      works for the case that motivated building it, not left theoretical.

## 10. Cross-cutting concerns

### 10.1 Security and privacy

- DMCA notice/counter-notice data contains real names, contact information,
  and signatures — access restricted to legal/Trust & Safety staff, with
  the explicit exception in §4.2 that complainant contact info is
  deliberately disclosed to the counter-notifying party, unlike every other
  report type in this system.
- `ContentRevision` snapshots inherit the same visibility rules as their
  subject — a revision of a `private` article (Phase 7 §3.2) is exactly as
  private as the current version, not a separately-secured copy.
- DMCA notice/counter-notice submission forms and version-history UI meet
  the accessibility standing requirement from Phase 1 §7.3 — not restated
  in full per phase from here on.

### 10.2 Search

No new search surface — like Phase 10 and most of Phase 11, this phase is
compliance/legal tooling, not discoverable consumer content. Noted
explicitly so the absence reads as assessed, not overlooked.

## 11. Explicit open questions for product/legal sign-off

- **DMCA-only vs. multi-jurisdiction launch (§4.1, §9)**: is a fully
  DMCA-compliant US workflow sufficient at launch, with other regimes added
  later via `JurisdictionRule`, or does an initial multi-region launch
  require a second regime (e.g. EU) simultaneously?
- **Statutory attestation language and counter-notice waiting period
  (§4.1)**: needs legal drafting of the exact text and confirmation of the
  exact statutory day count, not engineering-invented wording.
- **Repeat-infringer strike threshold and consequence (§4.3)**: needs
  legal/policy sign-off given safe-harbor protection depends on this being
  real, not cosmetic.
- **Watermarking default (§6.1)**: opt-in per upload, or opt-out (default
  on) for specific high-risk categories like marketplace digital goods and
  paid courses?
- **Ownership transfer consent model (§7)**: does a transfer require both
  parties' explicit consent, or can one party record it unilaterally?
- **`JurisdictionRule` maintenance ownership (§9)**: who updates this data
  as laws change or as the platform enters new markets — an ops/compliance
  team with tooling, or a formal legal-review-gated update process?

## 12. Suggested build sequence within Phase 13

1. `ContentRevision` for `Post`/`Article` (§3) — closes a real, currently-
   existing gap independent of everything else in this phase.
2. `ContentLicense` (§5) — independent, low complexity, no dependencies.
3. `DMCATakedownNotice`/`DMCACounterNotice` wired into Phase 12's
   `TrustSafetyCase`, with the repeat-infringer strike mechanism enforced,
   not just tracked (§4) — the highest-stakes step in this phase given the
   safe-harbor consequences; give it the most legal review before shipping.
4. Watermarking via the `FileAsset` extension (§6) — depends on Phase 11's
   `FileAsset` existing; independent of steps 1–3.
5. `OwnershipTransfer` (§7) — independent, minimal.
6. `JurisdictionRule` (§9), wired into this phase's own DMCA-vs-other-
   regimes logic as the proving case — sequence after step 3, since it
   needs a real consumer to justify its existence rather than shipping
   unused.
7. Reserved-word list audit/expansion for 0dot's own brand terms (§8) —
   low-effort, ongoing responsibility rather than a discrete build step.
8. Notification producers for the DMCA lifecycle (notice received, content
   removed, counter-notice received, content restored, strike issued) —
   sequence after step 3 exists, since these describe its outcomes.
