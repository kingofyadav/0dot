# Phase 16 — Future Modules Spec

Status: Built (triaged, per §2) — URL shortener, forms/surveys, and a lightweight CRM are genuinely new; notes/calendar/maps/donations/learning are thin layers over existing entities; podcasts/polling/newsletters were already built earlier. Cloud storage and video hosting were deliberately not built. This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table and `../../README.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md), [addendum-platform-billing.md](addendum-platform-billing.md)

## 1. Purpose & Scope

The roadmap lists sixteen items under "Future Modules" with no phase
number — deliberately unscheduled, unlike Phases 1–15. "Phase 16" is this
doc series' own numbering convenience for referring to them together, not
something the source roadmap assigns; each module below can be picked up
independently, in any order, whenever it's prioritized.

**This phase's real job is triage, not just design.** Sixteen items grabbed
from a wide-open list turn out to fall into four very different buckets,
and treating them uniformly would be a mistake:

1. **Already fully built** — Podcasts, Polling, and Email newsletters each
   already exist as real, shipped features in earlier phases. Building them
   "again" here would be duplicating working systems (§3).
2. **An explicit forward-reference from an earlier phase, now resolved** —
   Job board was named and deliberately deferred by Phase 4 §9.3, which
   even shaped its `Job` table in anticipation of this moment (§4).
3. **Substantial overlap with existing entities** — Notes, Digital business
   cards, Calendar, Maps, Donations, and Learning platform are each mostly
   reuse-and-recombine of data models Phases 1–9 already built, not new
   systems (§5–§10, §12).
4. **Genuinely new, and in a few cases genuinely large** — URL shortener,
   Forms/Surveys are modest new builds; Cloud storage and CRM are flagged
   with the same scope-warning treatment this series has given other
   disproportionately large sub-efforts (Phase 3/5/8's real-time
   infrastructure, Phase 9's freelance escrow) (§11, §13, §14).

Video hosting (§15) sits in its own category: it's unclear whether it means
something beyond what Phases 1, 5, and 8 already deliver, and that's worth
asking rather than assuming.

## 2. Triage summary

| Module | Status | Where |
|---|---|---|
| Podcasts | Already built | Phase 5 §9 |
| Polling | Already built | Phase 3 §8 |
| Email newsletters | Already built | Phase 5 §10 |
| Job board | Resolves Phase 4's deferral | §4 |
| Notes | Mostly already built | §5 |
| Digital business cards | Thin new layer over Profile | §6 |
| URL shortener | New, but the 3rd instance of a pattern | §7 |
| Calendar | Aggregation + one small new entity | §8 |
| Forms & Surveys | New, modest, one entity for both | §9 |
| Maps | Aggregation + a cross-phase fix | §10 |
| Donations | Reuses Phase 5's payment backbone | §11 |
| CRM | New, scope-warned — lightweight MVP recommended | §13 |
| Cloud storage | New, scope-warned — largest item on this list | §14 |
| Learning platform | Reuses Phase 5 Course + Phase 6 Certificate | §12 |
| Video hosting | Open question before any build | §15 |

## 3. Already built — don't duplicate

- **Podcasts**: `Podcast`/`PodcastEpisode`, RSS distribution, gated-episode
  private feed tokens — fully specified in Phase 5 §9.
- **Polling**: `Poll`/`PollOption`/`PollVote`, attachable to any `Post`, not
  community-exclusive — fully specified in Phase 3 §8.
- **Email newsletters**: `NewsletterIssue`/`NewsletterSubscription` with
  CAN-SPAM/GDPR unsubscribe compliance — fully specified in Phase 5 §10.

Confirm with product whether these roadmap bullets were meant to name
something beyond what's already built (e.g. a *cross-creator* podcast
directory, rather than each creator's own feed) before assuming more work
is needed here — the most likely explanation is simply that "Future
Modules" was drafted before the full Phase 1–15 breakdown existed and was
never reconciled against it, the same issue the completeness audit found in
the roadmap's "Recommended build order" section (see
[roadmap-audit.md](roadmap-audit.md) §3).

## 4. Job board — resolving Phase 4's named deferral

Phase 4 §9.3 explicitly declined to build a cross-business job board and
shaped its `Job` table so this moment wouldn't need a migration: "the `Job`
table here is intentionally shaped so that a future job-board feature can
query across all businesses' `Job` rows without a migration." This is that
feature, and it's mostly a discovery layer, the same "query-time union, not
a master table" principle Phase 9 §6.1 used for the Marketplace browse
experience:

- A cross-business jobs search/browse surface querying existing `Job` rows
  (Phase 4 §9.1) across every business, filterable by location, remote
  status, employment type — no new `Job`-equivalent table.
- `JobAlert` (new, small): a saved search that notifies a user when a
  matching `Job` is posted.

```
JobAlert
  id             uuid, pk
  user_id         uuid, fk -> User
  filter_criteria   jsonb  -- location, remote, employment_type, keywords
  created_at         timestamp
```

`JobApplication` (Phase 4 §9.1) needs no changes — applying still goes
through each business's own flow. `Notification.type` gains
`job_alert_match`.

### 4.1 Acceptance criteria

- [ ] No new `Job`-equivalent table is introduced — the job board queries
      Phase 4's existing table across all businesses.
- [ ] A `JobAlert` match notifies the user without requiring them to
      re-search manually.

## 5. Notes — mostly already built, a real design question remains

Phase 7 §3.1 already built `Article.format = note` with `private`
visibility as a real, server-enforced access boundary — a private,
low-ceremony personal note is already possible today. What Phase 7 §11
explicitly flagged as *not* decided is whether that's the right long-term
home: "is a private, frequent, low-ceremony 'note' different enough in real
usage patterns... to eventually warrant its own lightweight entity?" This
Future Modules bullet is a signal that the answer might be yes — a
dedicated, Evernote/Notion-style notes product (folders/notebooks, quick
capture, cross-linking between notes) is a meaningfully different product
than "an `Article` row with `format = note`." Recommend treating this as
the resolution point for that already-flagged open question rather than
building a second notes system speculatively: confirm with product whether
richer note organization is actually wanted before investing in it (§16).

## 6. Digital business cards — a thin layer over Profile, not a new product

A shareable, quick-contact-exchange view of a profile — name, title,
contact info, QR code — needs almost no new data. Phase 1 already built the
QR code (§3.4) and profile identity fields; Phase 6 already built
`WorkExperience` (§6.1), whose most recent entry supplies a natural
"current title/company." The only new piece is a small config for what
appears on the card and a standard vCard (.vcf) export:

```
DigitalBusinessCard
  profile_id        uuid, fk -> Profile, unique
  included_fields    jsonb  -- which Profile/ContactInfo/WorkExperience fields appear on the card
  enabled             boolean, default false
```

### 6.1 Acceptance criteria

- [ ] The card's vCard export and QR code both resolve to the same
      canonical profile URL Phase 1 §3.4 already established — no second
      identity representation is introduced.

## 7. URL shortener — the third instance of a pattern, generalized

### 7.1 Why this triggers generalization

"Short code + click analytics" has now appeared twice: Phase 1's `Link`
redirect/click tracking (§4.3) and Phase 5's `AffiliateLink` (§7.2). A
general-purpose shortener (shorten *any* URL, not just a link displayed on
your profile) is a third, independent instance — exactly the threshold this
series has used elsewhere to generalize rather than build a fourth bespoke
version later (Phase 7 §4.1's `Reaction`/`Comment`, Phase 13 §3.2's
`ContentRevision`).

```
ShortLink
  id              uuid, pk
  owner_id         uuid, fk -> User
  short_code        string, unique
  destination_url    string  -- scheme-validated, same rule as Phase 1 §4.2's link URLs
  click_count        integer, default 0
  created_at          timestamp

ShortLinkClick
  id              uuid, pk
  short_link_id     uuid, fk -> ShortLink
  occurred_at        timestamp
  referrer_host       string, nullable  -- no raw IP/UA, same posture as every click-analytics table since Phase 1 §4.3
```

### 7.2 Not retrofitted onto Link or AffiliateLink

Consistent with this series' standing non-retroactive-migration discipline
(Phase 9 §7.1, Phase 11 §6.2, Phase 13 §3.2): `Link` and `AffiliateLink`
keep their own existing short-code logic unchanged. `ShortLink` is the
primitive future instances should build on, not a replacement for the two
that already work.

### 7.3 Acceptance criteria

- [ ] `ShortLink.destination_url` rejects `javascript:`/`data:` schemes,
      identical to Phase 1 §4.2's link validation.
- [ ] Neither `Link` nor `AffiliateLink` is migrated onto `ShortLink` as
      part of this module.

## 8. Calendar — aggregation over existing commitments, plus one new entity

A personal calendar is mostly a *view*: appointments already booked via
Phase 4 (`Appointment`, as customer) and events already RSVP'd/ticketed via
Phase 8 (`EventRSVP`/`Ticket`, where status is `going`/`valid`) are queried
live at view time — the same "query-time union, not a master table"
principle used repeatedly in this series (Phase 9 §6.1, and again in §4 and
§10 of this document) — not copied into a new calendar-specific table. The
one new piece is a personal entry with no other backing entity:

```
CalendarEntry
  id            uuid, pk
  profile_id     uuid, fk -> Profile
  title          string, 1-120 chars
  starts_at       timestamp
  ends_at          timestamp, nullable
```

### 8.1 Acceptance criteria

- [ ] The calendar view surfaces `Appointment` and `EventRSVP`/`Ticket` rows
      live, without a duplicate copy of that data living in a
      calendar-specific table that could drift out of sync with the
      original booking/RSVP.

## 9. Forms & Surveys — one entity, two presentation modes

Surveys are forms with the analytics emphasis turned up, not a different
data shape — the same reasoning Phase 7 §5.2 applied to Documentation vs.
Wiki (same underlying pages, different presentation).

```
Form
  id                        uuid, pk
  owner_type                 enum: profile | business | organization | community
  owner_profile_id             uuid, fk -> Profile, nullable
  owner_business_id             uuid, fk -> Business, nullable
  owner_organization_id           uuid, fk -> Organization, nullable
  owner_community_id                uuid, fk -> Community, nullable
  -- four-way owner XOR — wider than most instances of this idiom because
  -- all four kinds of entity plausibly want to collect structured
  -- responses (event feedback, community intake, business surveys,
  -- personal forms), matching actual cardinality rather than defaulting to
  -- a narrower width
  title                        string, 1-160 chars
  fields                        jsonb[]  -- [{label, type: text|choice|rating|date, required, options}]
  mode                           enum: form | survey  -- presentation/analytics-emphasis only
  status                         enum: draft | published | closed

FormResponse
  id             uuid, pk
  form_id         uuid, fk -> Form
  respondent_id    uuid, fk -> User, nullable  -- nullable if the form allows anonymous responses
  answers           jsonb
  submitted_at       timestamp
```

A `Form` is a natural fit for Phase 9's sandboxed "app" widget category
(§4.2 of that spec) — embeddable on a profile/business/community page —
rather than a standalone surface with its own separate embedding mechanism.

### 9.1 Acceptance criteria

- [ ] Exactly one of the four `owner_*` fields is set on any `Form`.
- [ ] `mode` changes only presentation/analytics emphasis, never the
      underlying `FormResponse` schema.

## 10. Maps — aggregation, plus a consistency fix this exposes in Phase 8

### 10.1 The gap Maps surfaces

Building a map view surfaces a real, previously-unnoticed asymmetry:
Phase 4's `BusinessLocation` (§3.1 of that spec) has real
`latitude`/`longitude` fields; Phase 8's `Event.location` (§3.1 of that
spec) is free text only, with no coordinates. A map can't plot an event
that has no coordinates to plot. This should be closed as a small, additive
fix to Phase 8 rather than worked around here:

```
Event (Phase 8) gains:
  latitude    decimal, nullable
  longitude   decimal, nullable
```

### 10.2 The map itself

Mostly a client-side feature (an embedded maps SDK) rendering a live query
over `BusinessLocation` and now-geo-tagged `Event` rows — the same
aggregation-not-duplication principle as §8's calendar and §4's job board.
No new backend entity beyond the Phase 8 fix above.

### 10.3 Acceptance criteria

- [ ] Every in-person or hybrid `Event` created after this fix ships can
      optionally carry coordinates, closing the asymmetry with
      `BusinessLocation`.
- [ ] The map view queries `BusinessLocation`/`Event` live rather than
      maintaining a separate, duplicated geo-index table.

## 11. Donations — a fourth reuse of Phase 5's payment backbone

A donation is structurally very close to Phase 5's `Tip` (§6 of that spec)
— a one-time voluntary payment with no product exchanged — extended with an
optional fundraising goal to donate toward. This is at least the fourth
reuse of the `PaymentTransaction` ledger across phases (creators in Phase
5, tickets in Phase 8, business/freelance commerce in Phase 9, now
donations), the same backbone the addendum's §2 direct-billing topology
deliberately did **not** need, since a donation *does* have a payee (the
fundraiser), unlike that addendum's direct-to-platform charges.

```
FundraisingCampaign
  id                       uuid, pk
  organizer_type            enum: user | business | organization
  organizer_user_id          uuid, fk -> User, nullable
  organizer_business_id        uuid, fk -> Business, nullable
  organizer_organization_id      uuid, fk -> Organization, nullable
  -- three-way owner XOR, same width as Phase 8's Event hosting and Phase 14's internal communities
  title                        string, 1-160 chars
  goal_amount                    decimal, nullable  -- nullable = ongoing, no stated goal
  currency                        string
  raised_amount                    decimal, default 0  -- denormalized, same pattern used throughout
  ends_at                            timestamp, nullable
  status                              enum: active | completed | cancelled

Donation
  id                       uuid, pk
  campaign_id                uuid, fk -> FundraisingCampaign, nullable  -- nullable = a direct donation, same shape as a Tip
  donor_id                     uuid, fk -> User
  amount                        decimal
  currency                       string
  message                         string, nullable
  is_anonymous                     boolean, default false
  payment_transaction_id             uuid, fk -> PaymentTransaction  -- kind = donation
  created_at                          timestamp
```

`is_anonymous` hides the donor's name from *public* display only — the
recipient still sees who donated, for tax-receipt and thank-you purposes.
This is the same "anonymous to whom, specifically" distinction Phase 12
§4.2 and Phase 13 §4.2 drew sharply for reporter anonymity vs. DMCA
complainant disclosure — worth being equally explicit here rather than
letting "anonymous" read as a single, unqualified guarantee.

### 11.1 Acceptance criteria

- [ ] `Donation.payment_transaction_id` always resolves to a
      `kind = donation` `PaymentTransaction` — reusing the ledger, not a
      new one.
- [ ] `is_anonymous = true` hides the donor's identity from public campaign
      views but not from the organizer's own records.

## 12. Learning platform — Phase 5's Course, extended, with a Phase 6 payoff

### 12.1 Reuse, not a rebuild

Phase 5's `Course`/`CourseModule`/`Lesson` (§11 of that spec) is already a
real, structured learning-content system. A "learning platform" in the
fuller LMS sense adds curricula spanning multiple courses and assessment:

```
LearningPath
  id            uuid, pk
  creator_id     uuid, fk -> User
  title          string, 1-160 chars
  course_ids      uuid[]  -- ordered references to existing Course rows

Quiz
  id             uuid, pk
  lesson_id       uuid, fk -> Lesson
  questions        jsonb[]
  passing_score     integer

QuizAttempt
  id            uuid, pk
  quiz_id        uuid, fk -> Quiz
  user_id         uuid, fk -> User
  score            integer
  passed            boolean
  attempted_at       timestamp
```

### 12.2 A concrete cross-phase payoff

Completing a `Course` or `LearningPath` (every lesson viewed, every
required `Quiz` passed) should auto-create a `Certificate` row (Phase 6
§7.2) for the learner — a verifiable, portfolio-displayed record of
completion, rather than a certificate concept invented separately for
learning completions. This is a genuine, concrete reuse payoff this module
surfaces, not a forced connection: Phase 6 already built exactly the entity
a course-completion credential needs.

### 12.3 Acceptance criteria

- [ ] No second `Course`-equivalent content table is introduced — `Quiz`
      attaches to Phase 5's existing `Lesson`.
- [ ] Completing a `LearningPath` creates a `Certificate` (Phase 6 §7.2)
      row, not a separate, learning-platform-specific completion record.

## 13. CRM — scope-warned, lightweight MVP recommended

### 13.1 Scope warning

A full, configurable-pipeline CRM (custom deal stages, reporting, workflow
automation) is a substantial product in its own right — comparable to this
series' other flagged heavy sub-efforts (Phase 9 §3.3's freelance escrow,
Phase 14's SSO). Recommend a deliberately narrow MVP rather than a full
suite, and treat a fuller version as its own later initiative if actually
requested.

### 13.2 Lightweight MVP

```
Contact
  id                uuid, pk
  business_id         uuid, fk -> Business
  user_id               uuid, fk -> User, nullable  -- linked if this contact already has a 0dot account
  external_name          string, nullable
  external_email           string, nullable
  stage                     enum: lead | customer | churned  -- a fixed, simple pipeline, not configurable stages
  notes                       text, nullable
  created_at                   timestamp

Activity
  id               uuid, pk
  contact_id         uuid, fk -> Contact
  activity_type        enum: contact_message | appointment | purchase | manual_note
  source_id             uuid, nullable  -- the originating ContactMessage/Appointment/OfferingPurchase row, when derived rather than manually logged
  occurred_at             timestamp
```

Most `Activity` rows should be **derived** from data that already exists
(Phase 4's `ContactMessage`, `Appointment`, `OfferingPurchase`) rather than
manually re-entered — a business's existing customer touchpoints become a
CRM activity feed for free, the same "reuse what already exists" instinct
behind nearly every module in this document.

### 13.3 Acceptance criteria

- [ ] `stage` is a fixed three-value enum in this MVP, not a
      business-configurable pipeline — a deliberate scope limit.
- [ ] `Activity` rows for existing touchpoint types (`contact_message`,
      `appointment`, `purchase`) are created automatically from the
      originating event, not requiring manual re-entry.

## 14. Cloud storage — scope-warned, the largest item on this list

### 14.1 A materially different problem than every existing file upload

Every file-upload feature since Phase 1 attaches a file to one specific
piece of content (a post's media, a business document, a digital product,
a resume PDF) — Phase 11 §6.1 already consolidated the *storage* side of
this into `FileAsset`. **General-purpose cloud storage — a user
independently organizing files into folders, sharing them with permission
controls, operating within a storage quota, syncing across devices — is a
different product**, not an extension of "attach a file to content." Folder
hierarchies, sharing/permission models, storage quotas (which plausibly tie
to the addendum's Premium Profiles tier), and any sync-client work are each
real sub-projects. This is flagged with the same weight as this series'
other largest scope warnings (Phase 3/5/8's real-time infrastructure,
Phase 5's payment backbone) — confirm real appetite and scope before
committing timeline, rather than treating it as "just add folders to
`FileAsset`."

### 14.2 If pursued, a minimal starting shape

```
StorageFolder
  id             uuid, pk
  owner_id         uuid, fk -> User
  parent_folder_id   uuid, fk -> StorageFolder, nullable
  name               string, 1-120 chars

FileAsset (Phase 11) gains:
  folder_id   uuid, fk -> StorageFolder, nullable

StorageQuota
  user_id         uuid, fk -> User, unique
  bytes_used        bigint
  bytes_limit        bigint  -- tier-dependent; a natural tie-in to the Premium Profiles plan in the billing addendum
```

Sharing/permissions, device sync, and any client application are
explicitly **not** scoped in this minimal shape — each is its own
substantial addition on top of it, not implied by these three tables
existing.

### 14.3 Acceptance criteria (if the minimal shape is built)

- [ ] `StorageQuota.bytes_used` is enforced at upload time — a user over
      quota cannot add new files, not merely warned after the fact.
- [ ] No sharing/permission model is assumed to exist from this minimal
      shape alone — access remains owner-only until a sharing feature is
      separately scoped and built.

## 15. Video hosting — an open question before any build

### 15.1 What already exists

Video is already supported in three separate places: Phase 1 post media
(short attachments), Phase 5/8's `Livestream` with optional recording, and
implicitly anywhere `FileAsset` (Phase 11) stores a video file. A dedicated
YouTube-style platform — channels, subscriptions, a long-form VOD library,
watch-time analytics, video-specific discovery — is a meaningfully
different product from any of those, and it's genuinely unclear whether the
roadmap's "Video hosting" bullet means that, or is already satisfied by
what exists. Recommend confirming with product before scoping this further
(§16) rather than assuming a full platform is wanted or assuming existing
coverage is sufficient — both are real possibilities.

## 16. Explicit open questions for product sign-off

- **Notes** (§5): is Phase 7's `Article.format = note` sufficient
  long-term, or does this roadmap bullet mean a genuinely richer,
  separately-organized notes product (folders/notebooks, quick capture)?
- **Video hosting** (§15): does this mean a full dedicated platform, or is
  existing coverage (Phase 1 media, Phase 5/8 Livestream+recording)
  sufficient to consider this bullet satisfied?
- **Cloud storage scope** (§14): confirm real appetite for even the minimal
  shape before committing timeline, given its comparability to this
  series' largest flagged efforts.
- **CRM depth** (§13): is the fixed three-stage lightweight MVP sufficient,
  or is a fuller, configurable-pipeline CRM actually the expectation?
- **Storage quota tiers** (§14.2): how this ties into the Premium Profiles
  plan from [addendum-platform-billing.md](addendum-platform-billing.md) —
  a pricing decision, not resolved here.
- **"Podcasts"/"Polling"/"Email newsletters" as listed** (§3): confirm these
  roadmap bullets don't imply something beyond what Phases 3/5 already
  built, given "Future Modules" appears to predate the full 15-phase
  breakdown.

## 17. Sequencing

None of these modules has a fixed slot in the Phase 1–15 build order — each
is independently pickable whenever prioritized, the same "opportunistic,
no fixed phase" treatment the billing addendum gave custom domains and API
usage billing. Rough grouping by how cheap each is relative to its value:

- **Cheapest, highest reuse-to-new-code ratio**: Digital business cards
  (§6), Job board (§4), Calendar (§8), Maps (§10, plus the small Phase 8
  fix it requires) — mostly views/aggregations over data that already
  exists.
- **Modest new builds**: URL shortener (§7), Forms & Surveys (§9), Donations
  (§11), Learning platform extensions (§12).
- **Needs a scoping decision before any build**: Notes (§5), Video hosting
  (§15) — confirm intent first.
- **Needs a scope-appetite decision, and is the largest lift on this list**:
  Cloud storage (§14), CRM (§13, though its MVP is deliberately much smaller
  than a full CRM).
