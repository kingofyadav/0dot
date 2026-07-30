# Phase 7 — Knowledge Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md)

## 1. Purpose & Scope

Phase 7 lets a user publish long-form written content: articles,
documentation, tutorials, notes, wikis, books, and PDFs. Rather than seven
new tables for seven roadmap bullets, this phase leans hard on reuse: two of
those bullets (documentation, wikis) turn out to be the exact same
multi-page, versioned system Phase 3 already built for communities (§3.2),
and this phase is also where a pattern flagged twice before (Phase 4's
`Review`, Phase 6's `ProjectComment`/`ProjectLike`) finally crosses the
"three instances" threshold and gets generalized (§4).

**In scope:** Articles/tutorials/notes (one unified entity), a generalized
reaction/comment primitive, personal documentation & wikis (extending Phase
3's wiki system to profile ownership), books, PDF publishing.
**Out of scope:** multi-author collaborative editing of *personal* wikis
(Communities already provide that, see §5.4), structured multi-lesson paid
courses (that's Phase 5's `Course`, see §3.3 — tutorials here are single
documents, not sequenced lessons), any retrofit of Phase 4/6's existing
engagement tables onto the new generalized primitive (§4.3).

## 2. Success Criteria

- A user can publish an article, a personal documentation page, a book
  chapter, or a PDF, each with the same three-tier visibility model
  (public/unlisted/**private**), and `private` is a real, server-enforced
  access boundary — not the obscurity-only "unlisted" pattern used elsewhere
  (Phase 5 §9.2, Phase 6 §3.3) misapplied to something that needs to
  actually be private.
- Documentation and wikis reuse Phase 3's `WikiPage`/`WikiRevision` tables
  with zero loss of existing community-wiki behavior — this is an extension,
  not a parallel system.
- Every new content type in this phase plugs into one shared like/comment
  mechanism rather than each getting its own bespoke pair, reversing the
  trend of the last two phases.

## 3. Articles, tutorials, and notes

### 3.1 One entity, not three

Articles, tutorials, and notes share the same shape — title, long-form body,
draft/publish workflow, visibility — closely enough that a `format` field is
sufficient; they do not need three tables.

```
Article
  id                     uuid, pk
  author_id              uuid, fk -> User
  slug                   string  -- unique per author, e.g. 0dot.in/@username/articles/slug — scoped to the author's own namespace, not a new global reserved-slug pool (unlike /p/, /c/, /b/, which the roadmap explicitly gives top-level URL patterns; Phase 7 doesn't, so per-author uniqueness is sufficient and avoids a fifth global namespace)
  title                  string, 1-200 chars
  subtitle               string, 0-300 chars, nullable
  format                 enum: article | tutorial | note
  body                   text  -- sanitized markdown, same posture as every long-form field since Phase 1 §7.2
  cover_image_url        string, nullable
  status                 enum: draft | published
  visibility             enum: public | unlisted | private
  reading_time_minutes   integer  -- computed from word count at publish time, cached
  like_count             integer, default 0
  comment_count          integer, default 0
  view_count             integer, default 0
  published_at           timestamp, nullable
  created_at             timestamp
  updated_at             timestamp

ArticleHashtag
  article_id   uuid, fk -> Article
  hashtag_id   uuid, fk -> Hashtag  -- the same global Hashtag table from Phase 1 §5.1, not a separate article-tag taxonomy
```

Article tags are an explicit structured field the author fills in, not parsed
from inline `#hashtag` mentions in the body the way `Post` hashtags are
(Phase 1 §5.2) — long-form writing doesn't share social media's
inline-hashtag convention, but tags still write to the same shared `Hashtag`
table so discovery/search stays unified across posts and articles rather than
fragmenting into two tag systems.

### 3.2 Visibility: `private` is real access control, `unlisted` is not

This phase is the first to introduce a genuine `private` tier alongside
`public`/`unlisted`. The distinction must stay sharp:
- `unlisted` (as used in Phase 5 podcast feeds and Phase 6 projects) means
  "not listed or searchable, but anyone with the URL can view it" — obscurity,
  not authorization.
- `private` here means **server-side authorization-checked, author-only,
  full stop** — the correct model for a personal `note`, which is only
  useful at all if it can actually stay private.

This distinction is what makes `note` meaningfully different from `article`:
a note is typically `private`, short-lived, and casually written; an article
is typically `public` and polished. Both are still the same table — the
difference is data (visibility, format), not schema.

### 3.3 Tutorials are documents, not courses

A Phase 7 `tutorial` is a single long-form document — not a sequenced,
multi-lesson learning product with enrollment and progress tracking. That
already exists: Phase 5's `Course`/`CourseModule`/`Lesson` (§11 of that spec).
If a "tutorial" request starts wanting ordered steps with individual
completion tracking, that's a signal to point the user at Course, not to
grow this table toward duplicating it.

### 3.4 Acceptance criteria

- [ ] A `private` article/note is rejected by every read path (direct fetch,
      search, profile listing) for any user except its author, enforced
      server-side — not merely hidden in the UI.
- [ ] An `unlisted` article behaves exactly like Phase 6's unlisted projects:
      excluded from listings/search, resolvable via direct link.
- [ ] Article tags always resolve to the shared `Hashtag` table used by posts,
      never a separate tag vocabulary.

## 4. Generalized reactions and comments

### 4.1 Why this phase is where the pattern finally gets generalized

Phase 4 gave `Business` its own `Review` (rating + body + one official
response) because a business is "a single subject people react to," not a
space to post into (Phase 4 spec §11). Phase 6 gave `Project` its own
`ProjectLike`/`ProjectComment` for the identical reason, explicitly flagging
it as the second instance of that pattern and naming three instances as the
threshold to generalize (Phase 6 spec §9). `Article` (and, as this phase
builds them out, `WikiPage`/`Book`/`PublishedFile`) would be the third-plus
instance — this is that point.

```
Reaction
  id            uuid, pk
  subject_type  enum: article | wiki_page | book | published_file
  subject_id    uuid
  user_id       uuid, fk -> User
  kind          enum: like  -- one kind, deliberately — not overbuilt with a reaction-type palette nobody's asked for
  created_at    timestamp
  -- unique (subject_type, subject_id, user_id)

Comment
  id            uuid, pk
  subject_type  enum: article | wiki_page | book | published_file
  subject_id    uuid
  author_id     uuid, fk -> User
  body          string, 1-1000 chars
  created_at    timestamp
  deleted_at    timestamp, nullable
```

Flat, single-level comments — same simplification already applied to
`ProjectComment` (Phase 6 §9) and `Post`'s one-level reply threading
(Phase 1 §5.3).

### 4.2 Notification integration

`Notification.subject_type` (Phase 2 §4.1, already extended with `project`
and `skill` in Phase 6 §9.1) gains `article`, `wiki_page`, `book`, and
`published_file`. As before, no new `Notification.type` values are needed —
these reuse the existing generic `like`/`comment` types. The subject-type
list keeps growing before the action-type list does, which is exactly the
restraint this doc series has maintained since Phase 3 §15.

### 4.3 Explicitly not retrofitted onto Phase 4 or Phase 6

`Business.Review` and `Project`'s bespoke tables are **not** migrated onto
`Reaction`/`Comment` as part of this phase. Retrofitting existing,
working tables is a separate refactor with its own migration cost and risk
that doesn't need to ride along with shipping new features — the decision
here is to stop the pattern from repeating a fourth and fifth time going
forward, not to undo the first two instances. If that retrofit is wanted
later, it's a deliberate, scoped cleanup project, not a side effect of
Phase 7.

### 4.4 Acceptance criteria

- [ ] A like or comment on any of `article`/`wiki_page`/`book`/
      `published_file` writes to the shared `Reaction`/`Comment` tables, not
      a per-type variant.
- [ ] `Business.Review` and `Project`'s Phase 6 engagement tables are
      untouched by this phase — verified by absence of any migration touching
      them.

## 5. Documentation and wikis

### 5.1 Extending Phase 3's wiki, not building a second one

Phase 3's `WikiPage`/`WikiRevision` (§10 of that spec) was already built with
full append-only revision history, explicitly because it doubles as
groundwork for Phase 13's version-history requirement. Phase 7 is the first
phase to actually cash in that foresight: personal documentation and personal
wikis reuse the same two tables, extended for a second kind of ownership.

```
WikiPage gains:
  profile_id       uuid, fk -> Profile, nullable
  book_id          uuid, fk -> Book, nullable  -- see §6
  -- exactly one of community_id (Phase 3), profile_id, book_id is set;
  -- a three-way ownership XOR, enforced at the application/transaction layer
  kind             enum: wiki | documentation | book_chapter
  parent_page_id   uuid, fk -> WikiPage, nullable  -- hierarchy, new in this phase; null for every existing Phase 3 community wiki page, so nothing about community wikis changes
  position         integer  -- ordering among sibling pages
  visibility       enum: public | unlisted | private, nullable  -- meaningful only for profile_id/book_id-owned pages; community-owned pages keep using Community.visibility (Phase 3 §3.1) unchanged, this field is simply unset for them
```

`WikiRevision` (Phase 3 §10.1) is unchanged — every edit to a personal wiki
page, exactly like a community one, creates a new revision rather than
overwriting.

This is now a **three-way nullable-owner** pattern (`community_id` /
`profile_id` / `book_id`) — a step up from the two-way pattern already used
for `Link` (`profile_id`/`business_id`, Phase 4 §3.2). If a fourth owner type
is ever needed, that's the point to reconsider a polymorphic
`owner_type`/`owner_id` pair instead of a fourth column — not before, same
"don't generalize until it's earned" discipline as §4.1, just applied to a
different structural pattern (owner columns rather than engagement tables),
worth keeping distinct so the two don't get conflated.

### 5.2 Documentation vs. wiki: presentation, not data

`kind = documentation` vs. `kind = wiki` is a display distinction (docs get a
persistent nested table-of-contents sidebar; a wiki presents more like a
free-form, cross-linked page set) — not a structural one. Both use the same
`parent_page_id`/`position` hierarchy underneath.

### 5.3 Edit permissions for personal wikis/docs

Unlike a community wiki, where edit rights are configurable between
"moderators only" and "any member" (Phase 3 §10.1), a `profile_id`-owned or
`book_id`-owned page has exactly one editor: the profile owner. There is no
collaborator/co-author concept for personal wikis in Phase 7.

### 5.4 If someone wants collaborative personal editing

Point them at an existing feature rather than building a second
collaboration model: a private `Community` (Phase 3) with its own wiki
already supports multiple editors via `CommunityMember` roles. This is
explicitly the recommended path for "I want to co-write documentation with a
few people," not a gap to fill here.

### 5.5 Acceptance criteria

- [ ] Every `WikiPage` row has exactly one of `community_id`/`profile_id`/
      `book_id` set; a row with zero or more than one is rejected at write
      time.
- [ ] Existing Phase 3 community wiki pages continue to function with
      `parent_page_id` and `visibility` both null/unused — this migration is
      additive only.
- [ ] A user other than the profile owner cannot edit a `profile_id`-owned
      wiki page, even if they could edit a community wiki elsewhere.

## 6. Books

### 6.1 Data model

```
Book
  id                uuid, pk
  profile_id        uuid, fk -> Profile
  slug              string  -- unique per profile
  title             string, 1-200 chars
  description        string, 0-2000 chars
  cover_image_url     string, nullable
  status              enum: draft | published
  visibility          enum: public | unlisted | private
  ebook_file_url       string, nullable  -- optional full-book download (epub/pdf), same pre-signed pattern used throughout, for an author who'd rather upload a finished file than write chapters natively
  like_count           integer, default 0
  comment_count        integer, default 0
```

Chapters are `WikiPage` rows with `book_id` set and `kind = book_chapter`
(§5.1) — a book's table of contents is exactly the `parent_page_id`/
`position` hierarchy already built for documentation, reused rather than
given its own chapter entity. Chapter content gets the same revision history
as any other wiki page, which is a meaningful, free byproduct for authors
mid-draft (undo/history for a chapter, for free).

### 6.2 Two authoring paths, not a forced choice

A `Book` can be authored natively (chapters as `WikiPage` rows) or published
as a single uploaded file (`ebook_file_url`), or both — a native
table-of-contents alongside a downloadable complete version. Neither path is
mandatory; a book with only `ebook_file_url` set and no chapters is valid.

### 6.3 Acceptance criteria

- [ ] A book's chapter list renders in `position` order under whatever
      `parent_page_id` hierarchy exists, identical mechanics to Phase 3/7
      documentation pages.
- [ ] A `Book` with `ebook_file_url` set and zero chapters is a valid,
      publishable state — native chapters are not required.

## 7. PDFs

### 7.1 Data model

```
PublishedFile
  id                uuid, pk
  profile_id        uuid, fk -> Profile
  slug              string  -- unique per profile
  title             string, 1-200 chars
  description        string, 0-2000 chars
  cover_image_url     string, nullable
  file_url            string  -- pre-signed upload pipeline, same as every other file in this system
  file_size_bytes      integer
  visibility           enum: public | unlisted | private
  download_count       integer, default 0
  published_at         timestamp, nullable
  created_at           timestamp

PublishedFileDownload
  id                  uuid, pk
  file_id             uuid, fk -> PublishedFile
  occurred_at         timestamp
  referrer_host       string, nullable  -- same no-raw-IP/UA privacy posture as Phase 1 link-click analytics (§4.3 of that spec)
```

This is not authored on-platform — it's a finished document (a report, a
zine, a whitepaper) published as-is. It is the simplest content type in this
phase precisely because it wraps a single file rather than modeling
structured content.

### 7.2 Delivery differs by visibility — don't over-apply the paid-content pattern

A `public` `PublishedFile` can be served from a stable, permanent URL — there
is no gate to enforce, so there's no reason to route every download through
a short-lived signed-URL reissuance the way Phase 5 does for *paid* digital
products (§5.3 of that spec). A `private` or `unlisted` file, however, does
need the authorization check + short-lived signed URL pattern, since those
files must not be freely crawlable/cacheable at a stable public address. The
distinction: apply the heavier, gated-delivery mechanism only where there's
an actual access rule to enforce, not reflexively everywhere a file exists.

### 7.3 A recurring shape, noted but not consolidated here

This is at least the fourth place in this system that attaches an uploaded
file as an entity's primary content (Phase 4 `BusinessDocument`, Phase 5
`DigitalProduct.files`, Phase 6's several `file_url`/`resume_pdf_url`/
`badge_image_url` fields, now `PublishedFile`). Unlike the `Reaction`/
`Comment` case in §4 — which had real duplicated *logic* (permission checks,
notification wiring) worth consolidating — these are simple scalar
`file_url` columns with no shared behavior beyond "point at a pre-signed
upload." The cost of the duplication is low, so this is flagged as a
candidate for a future `FileAsset` cleanup pass, not acted on now — a
deliberate difference in treatment from §4's engagement-pair generalization,
not an inconsistency.

### 7.4 Acceptance criteria

- [ ] A `public` `PublishedFile` is servable via a stable URL with no
      per-request authorization check.
- [ ] A `private`/`unlisted` `PublishedFile` requires an authorization check
      before a signed download URL is issued, and that URL is short-lived.
- [ ] `PublishedFileDownload` records no raw IP or user-agent, consistent
      with every other click/analytics event in this system.

## 8. Search integration

Like Phase 6's Projects tab, this is a **new** search surface, not a stub
Phase 1 anticipated (§6.1 of that spec named only users, communities, posts,
and businesses). Given search has already grown one tab per phase since
(communities in Phase 3, businesses in Phase 4, projects in Phase 6), adding
a separate tab for each of articles/books/documentation/PDFs would mean four
more tabs on top of the existing four — worth resisting. Phase 7 adds **one**
combined tab (e.g. "Articles & Docs") spanning `Article`, `Book`, and public
`WikiPage`/`PublishedFile` rows, all indexed and ranked the same way:

- Postgres full-text search, same as every other entity.
- Ranking: exact title match first, then fuzzy title/body match, tie-broken
  by `like_count` then recency — the same shape reused for users (Phase 1
  §6.3), communities (Phase 3 §16), businesses (Phase 4 §14), and projects
  (Phase 6 §10).
- `private` content is never indexed at all (not merely excluded from
  results — it shouldn't be in the search index in the first place, since
  presence-with-a-filter is a weaker guarantee than absence). `unlisted`
  content is indexed-but-excluded, consistent with how Phase 6 treated
  unlisted projects.

## 9. Cross-cutting concerns

### 9.1 Security

- All long-form body/description fields sanitized markdown, same standing
  posture since Phase 1 §7.2.
- `private` visibility is enforced identically across `Article`, `WikiPage`,
  `Book`, and `PublishedFile` — one authorization check pattern, not four
  slightly different ones.
- Write endpoints (publish, comment, react) rate-limited, same standing
  requirement since Phase 1 §7.2.

### 9.2 Privacy

- Private content is excluded from search indexing entirely (§8), from
  profile listings, and from the owner's public RSS/sitemap surfaces if any
  exist.
- `PublishedFileDownload` and all other click/view analytics in this phase
  follow the no-raw-IP/UA posture established in Phase 1 §4.3.
- Article, wiki, book, and reader UI meet the accessibility standing
  requirement from Phase 1 §7.3 — not restated in full per phase from here
  on.

## 10. Interactions with Phases 1–6

- Reuses the pre-signed upload pipeline (Phase 1) for `cover_image_url`,
  `ebook_file_url`, `file_url` throughout this phase.
- Extends Phase 3's `WikiPage`/`WikiRevision` rather than building a second
  wiki system — the single largest reuse in this phase, and the payoff of a
  design decision Phase 3 made specifically anticipating it (Phase 3 §10.1).
- Introduces `Reaction`/`Comment` as a new shared primitive (§4), explicitly
  not retrofitted onto Phase 4's `Review` or Phase 6's `Project` engagement
  tables (§4.3).
- Extends `Notification.subject_type` again, adding no new `type` values —
  fourth consecutive phase to extend the subject list instead of the action
  list (Phase 3, 4, 6, now 7).
- **Revisits a Phase 6 open question**: Phase 6 §11 left open whether
  `Project.visibility` needs a real `private` option, not just `unlisted`.
  Since this phase builds genuine private-content authorization
  infrastructure anyway (§3.2), it's worth raising again now that the
  mechanism already exists rather than treating it as a permanently
  unresolved gap — flagged in §11 below, not decided unilaterally here.

## 11. Explicit open questions for product sign-off

- Should `Project.visibility` (Phase 6) be retrofitted with the same
  `private` tier now that this phase builds the real access-control
  machinery for it? (§10)
- Is single-author-only personal wiki/documentation editing acceptable
  indefinitely, with private communities as the standing recommended
  workaround for collaboration (§5.4), or does personal multi-author editing
  need to be built directly?
- Is native chapter-authoring for Books expected to be the primary usage
  path, or is "upload a finished ebook file" likely to dominate in practice —
  this affects how much polish native chapter-authoring deserves relative to
  the upload path.
- Is one combined "Articles & Docs" search tab (§8) sufficient, or does
  product want articles, books, and documentation separated into distinct
  result types despite the added search-UI surface?
- Does `note` (§3.1) actually belong in the `Article` table long-term, or is
  a private, frequent, low-ceremony "note" different enough in real usage
  patterns (much higher write frequency, far less structure) to eventually
  warrant its own lightweight entity? Flagging as a legitimate alternative
  not chosen here, worth revisiting if note usage patterns diverge sharply
  from articles in practice.

## 12. Suggested build sequence within Phase 7

1. `Article` (all three formats) + draft/publish workflow + the
   public/unlisted/private visibility model (§3) — establishes the visibility
   pattern every other entity in this phase reuses.
2. `Reaction`/`Comment` generalized primitive, scoped to `subject_type =
   article` initially (§4) + the `Notification.subject_type` extension —
   the engagement loop for step 1.
3. `ArticleHashtag` integration with the existing `Hashtag` table (§3.1) —
   small, independent addition.
4. Extend `WikiPage`/`WikiRevision` with `profile_id` ownership, `kind`, and
   `parent_page_id` hierarchy (§5) — verify zero regression against existing
   Phase 3 community wiki behavior before proceeding.
5. Extend `Reaction`/`Comment` to `subject_type = wiki_page`.
6. `Book` + `book_id` ownership on `WikiPage` for chapters + optional
   `ebook_file_url` (§6) — depends on step 4's hierarchy support.
7. Extend `Reaction`/`Comment` to `subject_type = book`.
8. `PublishedFile` + `PublishedFileDownload` + visibility-dependent delivery
   (§7) — independent of steps 4–7, can be parallelized with them.
9. Extend `Reaction`/`Comment` to `subject_type = published_file`.
10. Combined search integration (§8) — depends on steps 1–8 existing;
    naturally lands last.
