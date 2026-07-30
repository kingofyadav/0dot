# Phase 11 — AI Platform Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md), [phase-10-developer-platform.md](phase-10-developer-platform.md)

## 1. Purpose & Scope

Phase 11 is different in character from every phase before it: it adds
almost no new *content types* and instead layers AI capabilities onto
content and workflows that already exist — profiles, articles, moderation
queues, search, recommendation surfaces. Two things this phase resolves by
name: Phase 2's `Suggested Users` heuristic was explicitly built as a
placeholder "to revisit when there's enough interaction data for the Phase
11 AI recommendation system to take over" (Phase 2 §3.3) — that's now (§7).
And every review gate built since Phase 3 (community joins, business
claims, marketplace listings, sensitive OAuth scopes) said automated
screening could *supplement, never replace* human review — AI moderation
(§4) is that automated layer, and this spec holds the line on that
constraint rather than quietly loosening it now that the technology to
loosen it exists.

**In scope:** a shared AI-usage audit substrate; AI-assisted profile
building and content writing (both producing suggestions, never bypassing
existing validation); AI moderation (strictly assistive, with one
legally-distinct exception); AI-augmented search and recommendations
(both framed as enhancements to existing ranking mechanisms, not new
systems); AI translation; AI accessibility (alt-text/captions), including
finally consolidating the file-attachment pattern Phase 7 flagged and
deferred.
**Out of scope:** any AI decision that fully replaces human moderation
judgment for ordinary content categories (§4.2); a full always-on
personalized ML recommendation platform built in one shot (§7.1 — scope
warning, same category as prior phases' heavy-infra flags); retroactively
migrating every pre-existing file upload column onto the new consolidated
`FileAsset` table (§6.1 — new uploads only, consistent with Phase 9's
non-retroactive generalization discipline).

## 2. Success Criteria

- Every AI feature invocation is logged through one shared, auditable
  substrate — a support agent or safety reviewer can answer "what did the AI
  see, what did it produce, and did a human confirm it" for any of the seven
  roadmap features from one place, not seven bespoke logs.
- AI-generated content (profile suggestions, article drafts) is inserted
  into the exact same compose/validation/publish pipeline a human uses —
  there is no AI-only write path that skips sanitization or rate limiting.
- No content category with severe, time-sensitive legal reporting
  obligations (§4.3) is handled by the same confidence-threshold,
  human-review-queue mechanism used for ordinary moderation — it gets its
  own dedicated, legally-reviewed pipeline.
- Semantic search and recommendation ranking respect the exact same
  public/unlisted/private visibility rules already established — a private
  note's embedding must not exist in any queryable index, full stop, not
  merely be filtered at query time.

## 3. Shared AI usage audit substrate

### 3.1 Why this is generalized from the first feature, not the third

This series has consistently waited for three real instances of a pattern
before generalizing it (Reaction/Comment in Phase 7 §4.1, the explicit
non-retrofit of `Review` in Phase 9 §7.1). AI usage logging is the
deliberate exception, generalized starting with the very first feature:

```
AIGeneration
  id               uuid, pk
  feature          enum: profile_builder | content_writer | moderation | recommendation | search_rerank | translation | accessibility_caption
  requested_by     uuid, fk -> User, nullable  -- null for system-initiated generations (e.g. async moderation classification of new content)
  subject_type     string, nullable
  subject_id       uuid, nullable
  model_name       string  -- model/version identifier, for reproducibility
  input_summary    jsonb  -- bounded, privacy-conscious — see §3.2
  output_summary   jsonb
  accepted         boolean, nullable  -- did a human accept/use/uphold the output; null while pending
  cost_tokens      integer, nullable
  created_at       timestamp
```

The reasoning for generalizing immediately rather than waiting: every AI
capability shares identical audit, cost, and compliance needs (which
model produced this, what went in and out, how much it cost, whether a
human confirmed it) — and the cost of *not* having this from day one
(opaque "why did the AI do this" incidents, ungoverned inference spend) is
materially higher than the cost of building one shared table up front. This
is a genuinely different risk calculus than the engagement-primitive cases
that justified waiting, not an inconsistency with that earlier discipline.

### 3.2 AIGeneration inherits the sensitivity of its subject

A generation record about private content is itself sensitive data.
Concretely: an `AIGeneration` row produced while a user drafts a private
note (Phase 7 §3.2 — real, server-enforced private access control) must not
be freely queryable by anyone but that user and staff under a defined
access policy, and should have a bounded retention window rather than
indefinite storage — specifically because indefinite, verbatim retention of
inputs derived from private content would quietly undermine the privacy
guarantee Phase 7 established. `input_summary`/`output_summary` should be
bounded/redacted representations, not necessarily a verbatim full prompt,
when the subject is private.

### 3.3 Acceptance criteria

- [ ] Every one of the seven features in this phase writes at least one
      `AIGeneration` row per invocation — no feature ships with a separate,
      bespoke logging mechanism.
- [ ] An `AIGeneration` row whose subject is `private` (per that subject's
      own visibility field) is access-controlled identically to the subject
      itself, and is retained for a bounded period, not indefinitely.

## 4. AI moderation

### 4.1 Assistive by design, not by accident

Four prior phases explicitly reserved room for exactly this feature while
drawing the same line: automated screening supplements human review, it
doesn't replace it (Phase 3 community moderation had no reporting/appeals
path at all yet, by design; Phase 4 §3.3's business-claim gate; Phase 9
§4.5's marketplace listing review; Phase 10 §4.3's sensitive-scope review).
This phase is the arrival of the automation those specs anticipated, and it
should honor the constraint they each stated rather than treat "the AI is
good now" as a reason to quietly cross it.

```
ModerationFlag
  id                 uuid, pk
  subject_type        string  -- spans content types across the whole system: post, article, comment, marketplace_listing, business, etc.
  subject_id          uuid
  ai_generation_id     uuid, fk -> AIGeneration
  risk_category        enum: spam | harassment | violence | ip_infringement | fraud | other  -- illustrative; a real taxonomy needs dedicated policy/legal definition
  confidence           decimal  -- 0.0-1.0
  suggested_action      enum: none | flag_for_review | escalate_urgent
  status               enum: pending_human_review | upheld | overridden
  reviewed_by           uuid, fk -> User, nullable
  reviewed_at            timestamp, nullable
  created_at             timestamp
```

Note `suggested_action` has no auto-remove value for ordinary categories —
every flagged item in this table ends at a human decision (`upheld` or
`overridden`), recorded the same way Phase 3's `ModAction` (§13 of that
spec) recorded community moderator decisions. A minimal human-review
interface is pulled forward as part of this phase rather than waiting on
Phase 12's fuller Trust & Safety build-out, the same "pull forward the
minimum needed" move already used for `Block` (Phase 2 §5.6), `ModAction`
(Phase 3 §13), and the business-claim gate (Phase 4 §3.3).

### 4.2 The one deliberate exception, and why it's not in this table

Content matching known CSAM hash-matching databases (e.g. PhotoDNA/NCMEC
hash lists) is categorically different from every other row this table
could hold — in most jurisdictions it triggers a **mandatory, time-sensitive
legal reporting obligation** (e.g., to NCMEC in the US), not a discretionary
moderation judgment call with a tunable confidence threshold. This must
**not** be modeled as a `risk_category` value indistinguishable from "spam"
alongside a human-review queue — it needs its own dedicated, legally-
reviewed pipeline that auto-actions (removes and reports) without routing
through ordinary moderator-queue economics, and that follows separate,
legally-governed rules about what (if anything) the uploader is told —
the standard "notify the user their content was actioned" pattern
explicitly does **not** apply here, since notifying a suspect can itself be
harmful to an investigation. This is flagged with real prominence rather
than folded into §4.1's general model, given the seriousness of getting it
wrong.

### 4.3 Acceptance criteria

- [ ] No `ModerationFlag.suggested_action` value results in content removal
      without a `reviewed_by` human decision, for any `risk_category` in
      this table.
- [ ] The CSAM-pattern pipeline (§4.2) is implemented as a wholly separate
      system from `ModerationFlag`, is legally reviewed before launch (this
      is one of the very few open items in this entire spec series treated
      as launch-blocking rather than deferrable, alongside Phase 8's
      recording-consent requirement), and does not send a standard user
      notification.
- [ ] Standard moderation notifications (§8) are sent for `upheld`
      `ModerationFlag` outcomes on ordinary categories, giving the affected
      user visibility into what happened to their content.

## 5. AI content writer and AI profile builder

### 5.1 Suggestions go through the same pipeline as manual input

Both features produce draft content a user reviews and can edit before
saving — an assisted first draft of an `Article` body, a `Post`, a
`Business` description, or a `Profile` bio/theme suggestion. This is a
direct reapplication of the principle Phase 9 §4.4 established for
marketplace templates: **AI-generated content is inserted into the same
compose/edit surface a human would use and is subject to the identical
sanitization, validation, and rate limiting as manually-typed content before
it can be saved or published — never a privileged AI-only write path.**
`AIGeneration.accepted` records whether the user actually used the
suggestion, distinct from whether it was merely generated.

### 5.2 Disclosure is a real, unresolved policy question

Whether AI-assisted content should carry a visible disclosure label — and
what threshold of AI involvement triggers one (a grammar suggestion versus a
fully AI-drafted article) — is an evolving legal and platform-policy
question in this space. It is flagged in §10 for legal input, not decided
by default here.

### 5.3 Acceptance criteria

- [ ] No content produced by the content writer or profile builder can be
      persisted without passing through the same validation the manual
      compose path enforces.
- [ ] `AIGeneration.accepted` is set based on whether the suggestion was
      actually used, not merely whether it was generated.

## 6. AI accessibility

### 6.1 Finally consolidating the file-attachment pattern Phase 7 deferred

Phase 7 §7.3 named a recurring shape — "attach an uploaded file as an
entity's primary content" (Phase 4 `BusinessDocument`, Phase 5
`DigitalProduct.files`, several Phase 6 `file_url` fields) — and explicitly
declined to consolidate it, since the duplication was low-cost (simple
scalar URL columns, no shared logic). AI accessibility metadata is the
first real *logic* (not just a field) that needs to attach uniformly across
every one of those file-bearing fields — alt-text, captions, and future
accessibility scoring all want identical treatment regardless of which
entity's upload they're attached to. That tips the earlier cost/benefit
call the other way:

```
FileAsset
  id              uuid, pk
  url             string
  content_type    enum: image | video | audio | document
  uploaded_by     uuid, fk -> User
  created_at      timestamp

MediaAccessibilityMetadata
  id                uuid, pk
  file_asset_id      uuid, fk -> FileAsset, unique, nullable  -- see below for the legacy-content case
  legacy_subject_type string, nullable  -- for content uploaded before this phase, see §6.2
  legacy_subject_id    uuid, nullable
  legacy_field_name    string, nullable
  alt_text            string, nullable
  caption_vtt_url      string, nullable
  transcript           text, nullable
  ai_generation_id      uuid, fk -> AIGeneration
  human_edited          boolean, default false  -- an AI-generated alt-text/caption that a human corrected must not be silently overwritten by a later re-generation
  created_at            timestamp
  updated_at            timestamp
```

### 6.2 New uploads only — not a retroactive migration

Consistent with Phase 9's decision not to retrofit `Review`/`ProjectComment`
when generalizing engagement (§7.1 of that spec), `FileAsset` is used for
**all new uploads from this phase forward**, but existing file columns
across Phases 1/4/5/6/7 are **not** retroactively migrated onto it as part
of this spec — that's a separate, larger cleanup project with its own
cost/risk profile. Accessibility metadata for pre-existing content attaches
via the lighter-weight `legacy_subject_type`/`legacy_subject_id`/
`legacy_field_name` triplet instead of a `file_asset_id`, until (and unless)
a dedicated future migration performs the full consolidation.

### 6.3 Generation is async, never blocking the upload

Alt-text/caption generation runs as an asynchronous post-upload enrichment
job — the same "never computed synchronously during a request" principle
already applied to Phase 6's GitHub metadata sync (§5.2 of that spec).

### 6.4 Acceptance criteria

- [ ] Every new file upload from this phase forward creates a `FileAsset`
      row; no new upload path bypasses it.
- [ ] `human_edited = true` on a `MediaAccessibilityMetadata` row prevents a
      subsequent automated re-generation from overwriting it.
- [ ] Accessibility metadata generation never blocks or delays the upload
      response itself.

## 7. AI recommendations

### 7.1 Scope warning, same category as prior heavy-infra flags

A full, always-on, continuously-retrained personalized recommendation
platform is comparable in weight to this series' other flagged heavy builds
(the Phase 5 payments backbone, Phase 3/5/8's real-time infrastructure).
Confirm appetite and starting sophistication with product before committing
timeline — starting with simpler collaborative-filtering/co-engagement
signals rather than a full learned-embedding system from day one is the
recommended default, not an assumed given.

### 7.2 A re-ranking layer over existing surfaces, not a ninth new system

Every phase since Phase 1 has specified its own explicit tie-break rule for
its own ranking surface: engagement-then-recency for users/communities/
businesses/projects/articles (Phase 1 §6.3, Phase 3 §16, Phase 4 §14, Phase
6 §10, Phase 7 §8), soonest-`starts_at` for events (Phase 8 §9.1),
category-specific signals for marketplace (Phase 9 §6.2). Properly scoped,
AI recommendations is a **learned re-ranking signal that supplements each of
those existing tie-breaks with a personalized signal** — not a separately
invented recommendation product sitting alongside nine other ranking
systems. This directly resolves Phase 2's flagged `Suggested Users`
placeholder (§3.3 of that spec: "revisit when there's enough interaction
data for the Phase 11 AI recommendation system to take over") — that
heuristic's mutual-follows/verified/recency signals get blended with a
learned similarity signal now that the data Phase 2 said to wait for
actually exists.

### 7.3 Acceptance criteria

- [ ] AI-driven re-ranking is applied as an additional signal within each
      surface's existing ranking logic, not as a parallel, independently
      maintained recommendation list per surface.
- [ ] Suggested Users (Phase 2 §3.3) is confirmed upgraded to include the
      learned similarity signal, not left as the original placeholder
      heuristic indefinitely.

## 8. AI search

### 8.1 Hybrid, not a replacement

Nine reuses of exact-match-then-fuzzy-then-tiebreak lexical search (Phase 1
§6.3 through Phase 9 §6) represent proven, cheap, deterministic behavior —
particularly valuable for precise lookups (finding `@exact_handle`) that a
semantic/embedding approach can actually do *worse* at. AI search should
therefore be introduced as an **additional retrieval signal** (semantic
similarity), blended with or offered alongside the existing lexical ranking
for natural-language/conceptual queries that lexical full-text search
handles poorly — not a wholesale replacement of nine phases of validated
search work.

### 8.2 Semantic indexes must respect visibility exactly like the lexical one

Phase 7 §8 established that private content must be excluded from the
lexical search index entirely — not merely filtered out at query time,
since presence-with-a-filter is a weaker guarantee than absence. **Any
vector/embedding index built for semantic search must honor the identical
rule**: a private note's embedding must not exist in any queryable index at
all. This is worth restating explicitly for the new index type rather than
assuming the earlier principle obviously carries over.

### 8.3 Acceptance criteria

- [ ] No embedding/vector representation of `private`-visibility content
      exists in any index queryable by anyone other than its owner.
- [ ] Semantic re-ranking is applied as a supplementary signal to existing
      lexical search results, not a separate search feature a user has to
      choose between.

## 9. AI translation

### 9.1 Cached, versioned, and visibility-inheriting

```
ContentTranslation
  id                    uuid, pk
  subject_type           string
  subject_id             uuid
  source_revision_key     string  -- a WikiRevision id for versioned content (Phase 3/7), or the source's updated_at for non-versioned content (Post, Article)
  target_language          string  -- IETF BCP47 tag
  translated_text          text
  ai_generation_id          uuid, fk -> AIGeneration
  created_at                timestamp
  -- unique (subject_type, subject_id, source_revision_key, target_language)
```

Translation is on-demand and cached per exact source version — not
precomputed for every piece of content at write time, given per-call
inference cost (§10). `source_revision_key` ensures a stale translation of
an edited article is never served as current; keying off the existing
revision system for versioned content (Phase 3/7's `WikiRevision`) rather
than inventing a second versioning concept for translation purposes. A
translation inherits the exact visibility tier of its source — a translated
private note is exactly as private as the original, not a separately
secured copy that could leak through a gap in this feature's own access
checks.

### 9.2 Acceptance criteria

- [ ] Editing a source article/wiki page invalidates any cached translation
      keyed to its prior `source_revision_key` — a stale translation is
      never served as current.
- [ ] A translation of `private` content is access-controlled identically to
      the source, verified through the same authorization check, not a
      separate one.

## 10. Cross-cutting concerns

### 10.1 Cost

Unlike most prior phases, every feature here has a real, ongoing per-call
inference cost rather than roughly fixed infrastructure cost. Rate limiting
and/or tiering of AI feature usage (content-writer generations, translation
calls, etc.) by account type is a real, likely-necessary control — flagged
as an open question (§11) rather than assumed, since it may imply a
broader free/paid account-tier concept this roadmap hasn't fully defined
elsewhere.

### 10.2 Security and privacy

- No AI-generated content bypasses existing sanitization/validation (§5.1).
- `AIGeneration`, `ContentTranslation`, and `MediaAccessibilityMetadata`
  rows all inherit their subject's visibility tier (§3.2, §9.1) — a
  consistent rule applied across every artifact this phase produces.
- No embedding/vector index exposes private content beyond what the lexical
  index already correctly excludes (§8.2).
- AI-generated alt-text/captions (§6) are one input to accessibility, not a
  substitute for it — the dashboard, moderation queue, and every other UI
  surface in this phase still must independently meet the general
  accessibility standing requirement from Phase 1 §7.3 (keyboard
  navigation, screen-reader compatibility, WCAG contrast).

### 10.3 Fairness and bias

AI moderation and recommendation models can encode bias that affects
certain groups or content disproportionately. This isn't a one-time launch
gate — it needs an ongoing evaluation/audit cadence, not a single
pre-launch review, given model behavior can drift as it's retrained or as
usage patterns shift. Flagged in §11 for a decision on cadence/ownership,
not resolved by default here. The "supplement, not replace" framing in §4.1
partially mitigates the moderation risk by keeping a human in the loop for
anything but the clearest, legally-mandated cases (§4.2).

## 11. Explicit open questions for product/legal sign-off

- **CSAM-pipeline legal review** (§4.2): jurisdiction-specific reporting
  obligations and implementation specifics — treated as launch-blocking,
  not a normal deferrable item, given the seriousness of getting it wrong.
- **AI content disclosure/labeling policy** (§5.2): whether and at what
  threshold AI-assisted content needs a visible label — an evolving legal
  question needing dedicated legal input.
- **Bias/fairness audit cadence** (§10.3): one-time pre-launch review, or an
  ongoing program with defined ownership?
- **AI feature usage limits/tiering** (§10.1): does this need to tie into a
  broader account-tier concept that doesn't fully exist elsewhere in this
  roadmap yet?
- **Recommendation system sophistication at launch** (§7.1): simple
  co-engagement heuristics, or a full learned-embedding system — confirm
  scope before committing a timeline.
- **`FileAsset` retrofit** (§6.2): remain new-uploads-only indefinitely, or
  schedule a dedicated future migration to consolidate pre-existing file
  columns onto it?

## 12. Suggested build sequence within Phase 11

1. `AIGeneration` shared audit substrate (§3) — every other feature in this
   phase logs through it, so it comes first.
2. AI content writer + AI profile builder (§5) — lowest new-infrastructure
   cost, reuses existing compose/validation pipelines entirely, good early
   validation of the audit substrate before higher-stakes features build on
   it.
3. AI accessibility: `FileAsset` (new uploads only) +
   `MediaAccessibilityMetadata` + the async captioning/alt-text job (§6).
4. AI translation: `ContentTranslation` cache, keyed by source revision,
   inheriting visibility (§9).
5. AI moderation: `ModerationFlag` + the pulled-forward minimal human-review
   interface (§4.1), and — as a wholly separate, independently
   legally-reviewed effort, not sequenced as "part of moderation" — the
   CSAM mandatory-reporting pipeline (§4.2). Give this step the most
   scrutiny of anything in the phase before shipping.
6. AI search: hybrid semantic re-ranking layered onto existing lexical
   search, with the same indexing-exclusion rule as the lexical index (§8).
7. AI recommendations: learned re-ranking blended into the tie-break rules
   already established across every prior search/ranking surface, including
   the Phase 2 Suggested Users upgrade (§7) — sequenced last, after §7.1's
   scope/sophistication question is answered with product.
