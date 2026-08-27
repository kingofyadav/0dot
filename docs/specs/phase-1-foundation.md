# Phase 1 — Foundation (MVP) Spec

Status: Built (partial) — link ordering shipped as up/down buttons, not drag-and-drop (a Phase 1 follow-up); feed gained cursor pagination after this spec was written. This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table and `../../README.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md)

## 1. Purpose & Scope

Phase 1 ships the smallest complete version of 0dot.in: a person can claim a permanent
`0dot.in/@username`, build a profile with a link-in-bio page, post to a feed, and be
found via search. Everything in Phase 2+ (follow graph, messaging, communities,
business/creator tooling) is explicitly out of scope here — Phase 1 must not be
blocked on any of it, but the data model must not preclude it either (see §7).

**In scope:** Identity, Links, Feed, Search.
**Out of scope:** Follow system, DMs, notifications, communities, monetization,
verification badges beyond a boolean flag, AI features.

## 2. Success Criteria

- A new user can go from landing page → verified account → published `@username`
  profile with at least one link and one post in under 3 minutes.
- Every `@username` URL is permanent: once claimed, it is never silently reassigned
  or reset (see §3.5 for the only exceptions).
- Profile pages (`0dot.in/@username`) render fully server-side and are indexable by
  search engines without JS.
- p95 profile page load < 1s on a warm cache; p95 feed page load < 1.5s.

## 3. Identity

### 3.1 Data model

```
User
  id                 uuid, pk
  email              string, unique, required
  email_verified_at  timestamp, nullable
  password_hash      string, nullable (nullable to allow future OAuth-only accounts)
  phone              string, nullable, unique when present
  status             enum: active | suspended | deactivated | deleted
  created_at         timestamp
  updated_at         timestamp

Username
  id            uuid, pk
  user_id       uuid, fk -> User, unique (1:1 at launch — one username per user)
  handle        string, unique, citext, 3-30 chars
  claimed_at    timestamp
  released_at   timestamp, nullable  -- set on deliberate release, see §3.5

Profile
  id                uuid, pk
  user_id           uuid, fk -> User
  display_name      string, 1-50 chars
  bio               string, 0-280 chars
  avatar_url        string, nullable
  cover_url         string, nullable
  theme             jsonb  -- {preset, accent_color, background, font} — validated against a fixed enum of presets in Phase 1, not free-form CSS
  social_links      jsonb[]  -- [{platform, url}], max 10, platform from allowlist
  qr_code_url       string  -- generated, cached, derived from handle
  is_verified       boolean, default false  -- manually granted, no self-serve flow yet
  created_at        timestamp
  updated_at        timestamp
```

Why `Username` is a separate table from `Profile`: usernames are permanent identity,
profile fields are mutable presentation. Keeping them separate means a future
"transfer profile, keep handle reserved" or "multiple handles per account" (Phase 2+)
doesn't require a migration that touches the identity table.

### 3.2 Username rules

- Allowed characters: `a-z 0-9 _` (lowercase enforced at write time, case-insensitive
  lookup).
- Length 3–30.
- Reserved list (exact + prefix match) blocks: `admin`, `api`, `www`, `help`,
  `settings`, `about`, `feed`, `explore`, `trending`, `c`, `b`, `p`, `e`, `jobs`,
  `store`, `blog`, `developers`, `login`, `signup`, `0dot`, and anything matching
  `^\d+$` (all-numeric, reserved for future internal IDs). This list must be a
  single source of truth shared by the username-availability check and the router,
  so a reserved word can never be claimed even if the router adds a new top-level
  route later.
- No profanity/slur list enforcement is required for Phase 1 launch beyond the
  reserved list above — flag as a known gap for Trust & Safety (Phase 12).

### 3.3 Signup / login flow

1. **Start**: email + password (or "continue with Google" if OAuth is wired before
   launch — otherwise email/password only for Phase 1, OAuth deferred to Phase 10
   scaffolding but a stub is acceptable if trivial).
2. **Verify email**: signed, expiring (24h) link. Account is created in `active`
   status immediately but unverified accounts cannot claim a username or post —
   they can only browse.
3. **Claim username**: real-time availability check (debounced, ~250ms), reserved
   list enforced client- and server-side.
4. **Minimal profile**: display name defaults to username; avatar optional.
5. **Land on own profile** with an empty-state prompting to add links and post.

Session strategy: server-side session cookie (httpOnly, secure, sameSite=lax).
No client-held JWT for Phase 1 — keeps revocation trivial (delete session row) and
avoids token-refresh complexity this phase doesn't need.

### 3.4 Profile page (`0dot.in/@username`)

Sections, in order: cover photo, avatar, display name, `@handle`, verified badge
(if any), bio, social links row, theme-styled link list (see §4), QR code
(togglable via a share sheet, not shown by default), tab or scroll to that user's
posts (see §5).

- Public by default. No private-profile toggle in Phase 1 (that's a privacy
  feature worth flagging for Phase 12, not blocking here).
- 404 page for unclaimed handles must not leak whether a reserved word vs. a
  never-claimed handle — same "this page isn't available" response either way.

### 3.5 Permanence & exceptions

Usernames are permanent **while the account is active**. The only ways a handle
becomes available again:
- Account deletion completes (after any grace/undo period defined by account
  deletion flow) → handle enters a 30-day cooldown, then becomes claimable.
- Legal/Trust & Safety takedown (manual, out of self-serve flow).

There is no user-initiated "rename" in Phase 1. This is a deliberate constraint,
not an oversight: renaming breaks the "permanent, stable URL" principle from the
roadmap's Core Principles, and any future rename feature needs its own redirect
strategy (old handle → new handle) that's explicitly Phase 2+ scope.

### 3.6 Custom theme

Phase 1 theme is a **fixed preset system**, not arbitrary CSS/HTML injection:
a small set (5–8) of curated presets, each with a limited set of overridable
tokens (accent color, background color/gradient choice, font choice from a short
list). This avoids the XSS surface of user-supplied markup and matches "secure by
design" from the roadmap's Core Principles. Full custom CSS is out of scope
indefinitely unless revisited with a sanitization strategy.

### 3.7 Acceptance criteria

- [ ] Cannot complete signup without a verified, unique email.
- [ ] Cannot claim a reserved or already-claimed handle (case-insensitive).
- [ ] Handle, once claimed, resolves to the same profile until account deletion.
- [ ] Profile page renders with no client JS required to view content.
- [ ] Theme customization cannot inject arbitrary HTML/CSS/JS.
- [ ] QR code encodes the canonical `https://0dot.in/@handle` URL and regenerates
      only if the handle changes (it can't, per §3.5) — i.e., it's effectively
      immutable and cacheable forever.

## 4. Links (link-in-bio)

### 4.1 Data model

```
Link
  id            uuid, pk
  profile_id    uuid, fk -> Profile
  label         string, 1-80 chars
  url           string, required, must be valid http(s) URL
  position      integer  -- drag-and-drop order, unique per profile, dense (0..n-1)
  is_featured   boolean, default false
  starts_at     timestamp, nullable  -- scheduled visibility window start
  ends_at       timestamp, nullable  -- scheduled visibility window end
  click_count   integer, default 0  -- denormalized counter, see §4.4
  created_at    timestamp
  updated_at    timestamp
```

### 4.2 Rules

- Max links per profile in Phase 1: 100 (roadmap says "unlimited"; a soft cap
  prevents abuse/perf issues and can be raised later without a schema change —
  worth flagging as a decision to confirm with product, not silently deviating).
- `url` validated and normalized (scheme required, no `javascript:`/`data:`
  schemes — this is a direct XSS vector if skipped).
- Reordering is a batch operation: client sends the full ordered list of link IDs
  for a profile, server assigns positions transactionally. Avoids partial-order
  race conditions from optimistic single-item drag updates.
- `is_featured` links render visually distinct (larger card) at the top of the
  list, above non-featured links in position order. Only a small max (e.g. 3)
  can be featured at once — enforced server-side.
- Scheduled links: a link with `starts_at`/`ends_at` outside the current time is
  fetched but not rendered publicly; it still appears in the owner's edit view
  (grayed out with a "scheduled" badge) so they don't think it was deleted.

### 4.3 Click analytics

- Every public click is recorded as an append-only event
  (`link_id, occurred_at, referrer_host, country`) — no raw IP/UA stored, to
  keep this defensible under "privacy by default."
- `click_count` on `Link` is an async-updated denormalized total for fast display;
  the event table is the source of truth for any time-series chart.
- Owner-only analytics view: total clicks, clicks over last 7/30 days, top
  referrers. No per-visitor identification.

### 4.4 Acceptance criteria

- [ ] Owner can add, edit, delete, and reorder links; order persists and is what
      visitors see.
- [ ] A link with a future `starts_at` is invisible to visitors, visible
      (marked scheduled) to the owner.
- [ ] Clicking a public link records one analytics event and redirects via a
      server-side redirect (not client-side, so it still works with JS disabled
      and so the click is recorded before the browser navigates away).
- [ ] Malicious URL schemes are rejected at write time with a clear validation
      error.

## 5. Feed

### 5.1 Data model

```
Post
  id            uuid, pk
  author_id     uuid, fk -> User
  body          text, 0-500 chars (0 allowed only if >=1 media attached)
  media         jsonb[]  -- [{type: image|video, url, width, height, duration_s?}], max 4
  visibility    enum: public | deleted  -- no draft/private state in Phase 1
  reply_to_id   uuid, fk -> Post, nullable  -- comments are posts, threaded one level
  repost_of_id  uuid, fk -> Post, nullable
  created_at    timestamp
  deleted_at    timestamp, nullable  -- soft delete, tombstone remains for reply threads

PostEngagement
  post_id       uuid, fk -> Post
  user_id       uuid, fk -> User
  kind          enum: like | bookmark
  created_at    timestamp
  primary key (post_id, user_id, kind)

Hashtag
  id            uuid, pk
  tag           string, unique, citext, lowercase, no leading #

PostHashtag
  post_id       uuid, fk -> Post
  hashtag_id    uuid, fk -> Hashtag

Mention
  post_id       uuid, fk -> Post
  mentioned_user_id  uuid, fk -> User
```

### 5.2 Composing

- Text up to 500 chars, or media-only with 0 chars text.
- Up to 4 media attachments per post, images and/or video, server-side
  transcoding/thumbnailing (exact pipeline is an infra decision, not this spec's
  concern — but the API contract is: client uploads to a pre-signed URL, then
  references the resulting media ID in the post-create call).
- Hashtags (`#word`) and mentions (`@handle`) are parsed server-side at post-create
  time from `body`, not trusted from client-supplied structured fields — prevents
  a client from tagging hashtags/mentions that don't actually appear in the text.
- A mention of a non-existent handle is left as plain text (no silent failure, no
  error either — just doesn't become a link).

### 5.3 Engagement

- **Like**: toggle, one per user per post.
- **Bookmark**: toggle, private to the user, never shown to anyone else,
  no bookmark-count shown publicly.
- **Comment**: a `Post` with `reply_to_id` set. Phase 1 supports one level of
  reply threading rendered inline under the parent; a reply-to-a-reply is stored
  fine (schema supports arbitrary depth) but the UI in Phase 1 flattens it to
  "reply to the original post's thread" — deep nested-thread UI is Phase 2+.
- **Repost**: a `Post` with `repost_of_id` set and typically empty `body`
  (quote-repost with added text is allowed — `body` populated alongside
  `repost_of_id`).
- Counts (like/reply/repost) are denormalized on `Post` for read performance,
  updated via the same transaction as the engagement write (not a background
  job) to avoid visible lag/inconsistency on the count the user just changed.

### 5.4 Home feed

- Phase 1 has **no follow graph yet** (that's Phase 2). "Home feed" in Phase 1 is
  therefore reverse-chronological across all public posts — effectively what
  Phase 2+ would call "explore" or "global." This is a real behavior gap worth
  flagging: the roadmap lists Feed in Phase 1 and Follow System in Phase 2, so
  Phase 1's home feed cannot be personalized by follows yet. Confirm this is the
  intended MVP experience (a global chronological feed) before building, since
  it's a materially different product than what "home feed" usually implies.
- Pagination: cursor-based (`created_at` + `id` composite cursor), not offset —
  avoids skipped/duplicated posts as new posts arrive during scroll.
- Soft-deleted posts (`deleted_at` set) are excluded from all feed queries but
  their tombstone stays queryable by ID so reply threads don't 404 entirely
  (render as "this post was deleted").

### 5.5 Acceptance criteria

- [ ] A post with only media and empty body is allowed; a post with empty body
      and no media is rejected.
- [ ] Liking/unliking is idempotent per user and reflected in the count
      immediately for the acting user.
- [ ] Hashtags/mentions in a post body are extracted and linked automatically;
      tagging something not present in the text is not possible via the API.
- [ ] Deleting a post removes it from feeds but does not break reply threads
      referencing it.
- [ ] Feed pagination does not duplicate or skip posts when new posts are
      created during a scroll session.

## 6. Search

### 6.1 Scope for Phase 1

Search spans four entity types per the roadmap: users, communities, posts,
businesses. **Communities and businesses don't exist as entities until Phase 3
and Phase 4.** For Phase 1, search implementation should cover:

- **Users**: by handle (prefix match) and display name (fuzzy/substring).
- **Posts**: by body text and hashtag.
- Communities/businesses: build the search UI with those result-type tabs
  present but empty/hidden, so Phase 3/4 only need to add a data source, not
  redesign the search page.

### 6.2 Data source

- Phase 1 scale doesn't need a dedicated search engine (Elasticsearch/etc.) —
  Postgres full-text search (`tsvector` columns on `Profile.display_name` +
  `Username.handle`, and `Post.body`) is sufficient and keeps infra simple.
  Flag for revisit once post/user volume makes `tsvector` query latency a
  problem.
- Hashtag search is an exact/prefix lookup against the `Hashtag` table, not
  full-text — hashtags are already normalized tokens.

### 6.3 Ranking (Phase 1, intentionally simple)

- Users: exact handle match first, then prefix handle match, then display-name
  match, tie-broken by `is_verified` then account age.
- Posts: text relevance score from Postgres FTS, tie-broken by recency.
- No personalization (no follow graph yet, per §5.4) — same results for every
  searcher for a given query.

### 6.4 Acceptance criteria

- [ ] Searching an exact `@handle` returns that user first regardless of
      display-name matches elsewhere.
- [ ] Searching a hashtag (with or without leading `#`) returns posts containing
      that tag.
- [ ] Empty query states and zero-result states are handled explicitly (not a
      blank screen).
- [ ] Search UI has result-type tabs for all four entity types from the roadmap,
      with communities/businesses tabs present-but-empty rather than absent, to
      avoid a UI redesign in Phase 3/4.

## 7. Cross-cutting concerns

### 7.1 Forward-compatibility (non-goals that still shape the schema)

Phase 1 should not build follow/community/business features, but the schema
choices above are made so those phases don't require destructive migrations:
- `Username` separate from `Profile` (see §3.1) supports future multi-handle or
  org-owned handles.
- `Post.author_id` references `User` directly rather than `Profile`, since
  Phase 4+ business/community posts will need a non-personal author concept —
  worth a decision flag: introduce an `Author` polymorphic concept now vs. defer.
  Recommend **defer**; document as a known future migration rather than
  speculatively building it now (per "don't design for hypothetical future
  requirements").

### 7.2 Security

- All user-supplied rich content (bio, post body) is rendered as escaped text
  with server-side hashtag/mention linkification — never raw HTML.
- Theme system is preset-based, not free CSS (§3.6).
- Link URLs are scheme-validated (§4.2).
- Rate limiting on: signup, login attempts, post creation, link creation —
  exact thresholds are an infra/ops decision, not enumerated here, but the spec
  requires each of these endpoints to be rate-limited before launch.

### 7.3 Accessibility

This series otherwise restates security/rate-limiting as a standing,
every-phase requirement (see §7.2, echoed in nearly every later spec) but
never gave the roadmap's "Accessibility" Core Principle the same treatment
— it only surfaced once, as an AI-assisted feature in Phase 11 (generated
alt-text/captions). Stated here as the standing requirement it should have
been from the start: every UI surface built in every phase — not just
Phase 11's AI-generated alt-text — must be keyboard-navigable and
screen-reader-compatible, and meet WCAG 2.1 AA color-contrast and
semantic-markup conventions. This applies retroactively in spirit to every
phase's UI work, the same way the sanitization/rate-limiting requirement in
§7.2 does, even though it's only being written down explicitly here.

### 7.4 Privacy

- No IP/UA storage on link-click analytics (§4.3).
- Bookmarks are private, never exposed via any API to other users (§5.3).
- Deleted posts/accounts: define retention window for undo before hard delete
  (exact window TBD with legal — flag as open question, not a default to
  invent here).

### 7.5 Explicit open questions for product sign-off

- Is a global chronological feed (no follow graph) an acceptable Phase 1 "home
  feed," or should Phase 1 be resequenced to ship a minimal follow system
  alongside feed so "home feed" means what users expect? (§5.4)
- Link cap: is 100 the right soft limit, or should Phase 1 truly have no cap?
  (§4.2)
- OAuth in Phase 1 or deferred entirely to Phase 10? (§3.3)
- Account-deletion grace period and handle-release cooldown length — legal/ops
  input needed. (§3.5, §7.4)

## 8. Suggested build sequence within Phase 1

1. `User` + auth (signup/login/verify) — nothing else is testable without it.
2. `Username` claim flow + reserved list + profile page shell (SSR, no theme yet).
3. `Profile` fields (bio, avatar, social links) + theme presets.
4. `Link` CRUD + reordering + public rendering.
5. Link click redirect + analytics event capture (owner-facing analytics can
   trail slightly behind).
6. `Post` create/read (text + media) + public profile post list.
7. Engagement (like, bookmark, reply, repost) + denormalized counts.
8. Global feed with cursor pagination.
9. Search (users, then posts, then empty-state tabs for communities/business).
10. QR code generation, scheduled links, featured links — lower-risk polish
    items, safe to interleave once the above are stable.
