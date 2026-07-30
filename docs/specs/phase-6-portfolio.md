# Phase 6 — Portfolio Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md)

## 1. Purpose & Scope

Phase 6 introduces `0dot.in/p/project` and a set of profile sections
(resume, skills, git repositories, research papers, certificates, awards)
that let a person's `@username` page double as a professional portfolio, not
just a social profile. Unlike Phases 3–5, this phase is deliberately
**lower-complexity**: no new payment surface, no real-time infrastructure, and
— as a specific design choice explained in §9 — no changes to the `Post`
table at all, breaking a pattern the last three phases established.

**In scope:** Projects (with their own permalink), Skills (with
endorsements), Resume (work experience, education, generated page, optional
PDF), Git repository links, Research papers, Certificates, Awards.
**Out of scope:** any third-party credential-verification integration
(Credly/ORCID/issuer APIs — see §7.4), OAuth-based private-repo linking (see
§5.3), a project activity/update feed (see §9 — Projects are a showcase
subject, not a space to post into).

## 2. Success Criteria

- A user can publish a project at a permanent `0dot.in/p/slug`, credit
  collaborators, and have it appear on their profile and (if public) in
  search — all without touching the `Post` table.
- A user's Resume section renders from the same structured data
  (work experience, education, skills, featured projects) that a visitor
  browses individually elsewhere on the profile — it is not a second,
  disconnected data entry step.
- Every credential-bearing section (certificates, awards, papers) is clearly
  self-attested, with no implied verification the platform doesn't actually
  perform (see §7.4 — stated explicitly so it isn't mistaken for an oversight).

## 3. Projects

### 3.1 Data model

```
Project
  id                  uuid, pk
  slug                string, unique, citext, 3-60 chars  -- 0dot.in/p/slug
  owner_id            uuid, fk -> User
  title               string, 1-120 chars
  summary             string, 0-280 chars  -- shown on cards and in search results
  description         text  -- sanitized markdown, same posture as every user-authored long-form field since Phase 1 §7.2
  cover_image_url     string, nullable
  gallery             jsonb[]  -- additional media, max 12
  status              enum: in_progress | completed | archived
  started_at          date, nullable
  completed_at        date, nullable
  external_links       jsonb[]  -- [{label, url}], same URL-scheme validation as Phase 1 links (§4.2 of that spec) — no javascript:/data: schemes
  visibility           enum: public | unlisted
  featured_on_resume    boolean, default false
  like_count           integer, default 0
  comment_count        integer, default 0
  created_at           timestamp
  updated_at           timestamp

ProjectCollaborator
  id             uuid, pk
  project_id     uuid, fk -> Project
  user_id        uuid, fk -> User, nullable  -- nullable so a collaborator without a 0dot account can still be credited
  display_name   string, nullable  -- required when user_id is null
  role           string, nullable  -- free-text credit, e.g. "Designer"
  -- partial unique index on (project_id, user_id) where user_id is not null,
  -- preventing duplicate credit for the same registered user

ProjectSkill
  project_id   uuid, fk -> Project
  skill_id     uuid, fk -> Skill  -- see §4
  primary key (project_id, skill_id)
```

### 3.2 Slug rules

Reuses the same shared reserved-word/character policy as usernames (Phase 1
§3.2), community slugs (Phase 3 §3.2), and business slugs (Phase 4 §3.1) —
this is the **fourth** namespace built on that single validation function,
not a new policy.

### 3.3 Visibility

`unlisted` behaves like an unlisted video: viewable via direct link, excluded
from the owner's public profile listing and from search (§8). This is
obscurity, not real access control — the same honest caveat Phase 5 gave
podcast private-feed tokens (§9.2 of that spec): if an unlisted URL is shared
further, anyone with it can view the project. A fully private,
explicit-viewer-list mode (useful for NDA'd client work) is **not** built in
Phase 6 — flagged as an open question in §11 rather than assumed unnecessary.

### 3.4 Acceptance criteria

- [ ] Project slug validation/reservation shares the identical source used by
      usernames, communities, and businesses.
- [ ] An `unlisted` project is excluded from the owner's public project list
      and from search results, but still resolves at its direct URL.
- [ ] `external_links` reject `javascript:`/`data:` schemes, identical to
      Phase 1 link validation.
- [ ] A `ProjectCollaborator` with no `user_id` requires a non-null
      `display_name`.

## 4. Skills

### 4.1 Data model

```
Skill
  id                 uuid, pk
  profile_id         uuid, fk -> Profile
  name               string, 1-40 chars  -- free text; normalized (trimmed, case-folded for comparison) to reduce near-duplicate entries, not restricted to a fixed taxonomy the way Phase 4 business categories are, since skill vocabulary is too broad to curate exhaustively
  position           integer  -- display order, same drag-and-drop convention as Phase 1 links
  endorsement_count  integer, default 0

SkillEndorsement
  skill_id     uuid, fk -> Skill
  endorser_id  uuid, fk -> User
  created_at   timestamp
  primary key (skill_id, endorser_id)
```

Any logged-in user can endorse any skill once — no relationship gating (e.g.
no requirement to follow the person first), matching the platform's
generally open, ungated social defaults elsewhere (Phase 2 following is
similarly open). Endorsement write endpoints are rate-limited, same standing
requirement as every write endpoint since Phase 1 §7.2.

### 4.2 Acceptance criteria

- [ ] A user cannot endorse the same skill twice; a repeat request is a
      no-op, not an error, matching the idempotency pattern used for likes and
      follows elsewhere.
- [ ] `endorsement_count` stays consistent with the underlying
      `SkillEndorsement` rows, updated transactionally.

## 5. Git repositories

### 5.1 Data model

```
GitRepository
  id                uuid, pk
  profile_id        uuid, fk -> Profile
  project_id        uuid, fk -> Project, nullable  -- optionally attached to a specific project; also viewable standalone if null
  provider          enum: github | gitlab | bitbucket | other
  url               string
  display_name      string  -- cached from the provider or user-entered for `other`
  description       string, nullable
  primary_language  string, nullable
  star_count        integer, nullable
  last_synced_at    timestamp, nullable
```

### 5.2 Metadata sync

Public repository metadata (stars, description, primary language) is fetched
via the provider's public API and cached on `GitRepository`, refreshed on a
periodic interval (e.g. daily) — not fetched live on every profile view. This
is the same denormalized-cache reasoning used throughout (Phase 1 link click
counts, Phase 2 follower counts): live per-view calls to an external API would
be slow and would risk hitting that provider's rate limits at any real scale.

### 5.3 Public repos only — explicitly, not a gap

Linking a private repository would require OAuth token storage per user (a
GitHub/GitLab App installation, scoped tokens, refresh handling) — a real
security-surface increase (stored third-party credentials) for a feature this
phase doesn't need to justify. Phase 6 supports **public repository URLs
only**. If private-repo linking is wanted later, it's a deliberate, separate
scope addition with its own security review, not an assumed extension of this
table.

### 5.4 Acceptance criteria

- [ ] Repository metadata is refreshed on a background schedule, never
      synchronously during a profile page request.
- [ ] No OAuth token or credential of any kind is stored by this feature —
      only public URLs and their publicly-fetched metadata.

## 6. Resume

### 6.1 Data model

```
WorkExperience
  id             uuid, pk
  profile_id     uuid, fk -> Profile
  company        string, 1-100 chars
  title          string, 1-100 chars
  location       string, nullable
  start_date     date
  end_date       date, nullable  -- null = current position
  description    string, 0-2000 chars
  position       integer  -- manual override; defaults to reverse-chronological by start_date

Education
  id               uuid, pk
  profile_id       uuid, fk -> Profile
  institution      string, 1-100 chars
  degree           string, nullable
  field_of_study   string, nullable
  start_date       date
  end_date         date, nullable
  description      string, 0-1000 chars
  position         integer

Profile gains:
  resume_pdf_url   string, nullable  -- optional uploaded PDF, same pre-signed pattern as Phase 1 media
```

### 6.2 Why Resume isn't a separate data island

The Resume section is a **rendering** of data that mostly already exists
elsewhere on the profile — `WorkExperience`, `Education`, `Skill` (§4), and
any `Project` marked `featured_on_resume` (§3.1) — plus an optional uploaded
PDF as a static alternative/supplement. This avoids asking a user to enter
their skills or notable projects twice in two unrelated places.

### 6.3 Acceptance criteria

- [ ] The generated resume view reflects the same `Skill` and `Project` data
      shown elsewhere on the profile — there is no separate resume-only copy
      of that information to fall out of sync.
- [ ] If `resume_pdf_url` is set, it's offered as a download option alongside
      (not instead of, unless the owner explicitly hides the generated
      section — see §11) the generated page.

## 7. Research papers, certificates, and awards

### 7.1 Research papers

```
ResearchPaper
  id             uuid, pk
  profile_id     uuid, fk -> Profile
  project_id     uuid, fk -> Project, nullable  -- optional link to a related project
  title          string, 1-300 chars
  authors        string  -- free text (e.g. "A. Smith, B. Jones"); not modeled as linked Users, since co-authors are frequently not 0dot members
  venue          string, nullable  -- journal or conference name
  publish_date   date, nullable
  doi_or_url     string, nullable
  file_url       string, nullable  -- optional uploaded PDF, same pre-signed pattern
  abstract       string, 0-3000 chars
```

### 7.2 Certificates

```
Certificate
  id               uuid, pk
  profile_id       uuid, fk -> Profile
  title            string, 1-150 chars
  issuing_org      string, 1-150 chars
  issue_date       date
  expiry_date      date, nullable
  credential_id    string, nullable
  credential_url   string, nullable  -- external verification link the viewer can independently check, e.g. a Credly badge page
  badge_image_url  string, nullable
```

### 7.3 Awards

```
Award
  id             uuid, pk
  profile_id     uuid, fk -> Profile
  title          string, 1-150 chars
  issuing_org    string, nullable
  awarded_date   date
  description    string, 0-1000 chars
  link           string, nullable
```

### 7.4 Self-attested, not verified — an explicit non-goal

None of Certificate, Award, or ResearchPaper is verified against any
third-party source in Phase 6. `credential_url` lets a viewer click through
and check for themselves (same as LinkedIn's model), but 0dot doesn't
integrate with issuer APIs (Credly, Accredible, ORCID, etc.) to confirm
authenticity. This is named explicitly, the same way Phase 5 named the
podcast RSS gating limitation (§9.2 of that spec) — a known trust boundary
communicated up front, not a silent gap discovered later. Building real
verification integrations is a plausible future enhancement, not undertaken
here (see §11).

### 7.5 Acceptance criteria

- [ ] None of these three entities exposes any UI or copy implying
      platform-verified authenticity — only a self-reported credential with an
      optional external link.

## 8. Portfolio layout

`Profile` (Phase 1 §3.1) gains a `portfolio_layout` jsonb field — an ordered
list of section keys (`projects`, `resume`, `skills`, `repositories`,
`papers`, `certificates`, `awards`) with a per-section visibility toggle. This
reuses the same "small structured config blob on `Profile`" pattern already
established for `Profile.theme` (Phase 1 §3.1) rather than introducing a new
table for section ordering.

### 8.1 Acceptance criteria

- [ ] A section toggled hidden in `portfolio_layout` does not render on the
      public profile, even if the underlying rows (e.g. `Certificate` entries)
      still exist.

## 9. Why Post is unchanged in this phase

Phases 3–5 each extended `Post` with one additive, nullable column:
`community_id` (Phase 3), `business_author_id` (Phase 4),
`required_tier_id` (Phase 5). Phase 6 deliberately adds a **fourth** kind of
content instead of a fourth column: `Project` gets its own lightweight
engagement primitives rather than becoming another `Post` scope:

```
ProjectLike
  project_id   uuid, fk -> Project
  user_id      uuid, fk -> User
  created_at   timestamp
  primary key (project_id, user_id)

ProjectComment
  id            uuid, pk
  project_id    uuid, fk -> Project
  author_id     uuid, fk -> User
  body          string, 1-1000 chars
  created_at    timestamp
  deleted_at    timestamp, nullable
```

Comments are flat (single-level, no reply-to-a-reply threading) — the same
simplification Phase 1 already applied to post comments for the general
feed (§5.3 of that spec: "deep nested-thread UI is Phase 2+... [here, not
attempted at all]").

The reasoning for a new primitive instead of a fifth reuse of `Post`: a
`Community` or a paid membership tier is a **space people post into** —
that's what `Post.community_id`/`required_tier_id` model. A `Project`, like
Phase 4's `Business`, is a **single subject people react to**, not a space —
which is exactly why Phase 4 gave Business its own `Review` entity (§11 of
that spec) rather than routing reviews through `Post`. `ProjectComment`/
`ProjectLike` follow that same precedent. If a future phase needs a third
instance of "reactions on a single non-Post subject," that's the point to
generalize into one shared reviewable/commentable-subject primitive — not
before (the same "three instances before you abstract" discipline applied to
Phase 5's `LivestreamChatMessage`/`CommunityChatMessage` observation, §8.2 of
that spec).

### 9.1 Notification integration without growing the type enum

`Notification.subject_type` (Phase 2 §4.1) gains two values: `project` and
`skill`. No new `Notification.type` values are needed — a project like or
comment reuses the existing `like`/`comment` types with `subject_type =
project`; a skill endorsement reuses `like` with `subject_type = skill`. This
mirrors the restraint Phase 3 §15 and Phase 4 §13 already showed (reusing
existing types for ordinary content activity rather than growing the enum
per feature) and extends it one step further: even the *subject* type list
grows before the *action* type list does, since "like" and "comment" are
already generic enough to point at a new kind of thing.

### 9.2 Acceptance criteria

- [ ] Liking or commenting on a project produces a notification with
      `subject_type = project`, using the existing `like`/`comment` type
      values — no new type value is introduced.
- [ ] `ProjectComment` threading is flat; there is no `reply_to_id`-equivalent
      on this table.

## 10. Search integration

Unlike Phases 3 and 4, this isn't resolving a stub left by Phase 1 — Phase
1's search scope (§6.1 of that spec) only ever named four entity types
(users, communities, posts, businesses), with no anticipated "projects" tab.
Phase 6 adds one **new** first-class searchable surface:

- Projects become searchable by `title` and `summary` (same Postgres
  full-text approach used for every other entity so far).
- Ranking: exact title match first, then fuzzy title/summary match, tie-broken
  by `like_count` then recency — the same exact-then-fuzzy-then-engagement
  shape used for users (Phase 1 §6.3), communities (Phase 3 §16), and
  businesses (Phase 4 §14).
- `unlisted` projects (§3.3) are never returned by search, regardless of
  match quality.

Skills, certificates, awards, and papers are **not** added as independent
search result types — they're profile-embedded credentials best discovered
through the profile itself or through general user search, not surfaced as
standalone search results. Naming this as a deliberate scope boundary rather
than an oversight.

### 10.1 Accessibility

Project, resume, and portfolio-section UI meet the accessibility standing
requirement from Phase 1 §7.3 — not restated in full per phase from here on.

## 11. Explicit open questions for product sign-off

- Is `unlisted` project visibility (§3.3) sufficient, or is a genuinely
  private, explicit-viewer-list mode needed for client work under NDA?
- Should certificates/awards/papers ever get a lightweight verification path
  (e.g. an issuer-domain email confirmation), or is fully self-attested
  (§7.4) acceptable indefinitely, matching how LinkedIn operates?
- Should private-repository linking via OAuth (§5.3) be planned for a later
  phase, or is public-repo-only a permanent product decision?
- Resume display mode: can an owner hide the generated resume page entirely
  and offer only the uploaded PDF, or must the generated version always be
  available if any underlying data exists?

## 12. Suggested build sequence within Phase 6

1. `Project` + slug reservation (reuses the established pattern) + public
   `/p/slug` page with `public`/`unlisted` visibility — the anchor entity
   everything else in this phase optionally attaches to.
2. `ProjectLike`/`ProjectComment` + the two-value `Notification.subject_type`
   extension (§9) — the engagement loop for the entity built in step 1.
3. `Skill` + `SkillEndorsement` + `ProjectSkill` — independent of steps 4–6,
   can be parallelized.
4. `WorkExperience` + `Education` + resume page assembly + optional
   `resume_pdf_url` upload (§6) — depends on `Skill` (step 3) existing for a
   complete resume render, but not on Projects existing yet.
5. `GitRepository` + the periodic public-metadata sync job (§5) — independent,
   can be parallelized with steps 3–4 and 6.
6. `ResearchPaper`, `Certificate`, `Award` — independent, low-risk, safe to
   build in parallel with the rest of this phase.
7. `portfolio_layout` on `Profile` (§8) — sequence after the sections above
   exist, since there's nothing to order/toggle before then.
8. Search integration for Projects (§10) — depends on step 1 existing;
   naturally lands last.
