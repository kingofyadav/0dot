# Phase 3 — Communities Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md)

## 1. Purpose & Scope

Phase 3 introduces `0dot.in/c/community` — a shared space multiple users
organize around, distinct from the 1:1 social graph built in Phase 2. This
phase also closes out two things Phase 1 and Phase 2 deliberately stubbed
rather than built:

- Phase 1 Search (§6.1) shipped with a "communities" result tab present but
  empty, waiting for a real data source. Phase 3 provides it (§13).
- Phase 2 Notifications (§4.1) shipped a `community_update` enum value with no
  producer. Phase 3 provides producers (§12).

**In scope:** Community identity, membership, moderator roles, rules, tags,
wiki, polls, Q&A, live chat, voice rooms, community analytics.
**Out of scope:** Business accounts (Phase 4, though this phase's moderation
work is the template for it — see §9), the standalone events platform at
`0dot.in/e/event` (Phase 8 — this phase's lightweight "Events" is scoped
narrowly, see §7), platform-wide Trust & Safety tooling (Phase 12, though a
minimal per-community moderation primitive is pulled forward, same pattern as
Phase 2 pulling forward `Block` — see §9).

## 2. Success Criteria

- A user can create a community, configure its rules and visibility, and have
  it discoverable via search and `0dot.in/c/slug` within one flow.
- Community posts, polls, and Q&A threads all render in a single unified feed
  per community, using the same `Post` primitive from Phase 1 rather than three
  parallel content systems.
- A moderator can remove a post, mute a member, or edit a rule, and that action
  is attributable and auditable (modlog), even though full appeals tooling
  doesn't exist until Phase 12.
- Community search, discovery, and notifications work end-to-end — the two
  Phase 1/2 stubs referenced in §1 have real implementations, not just UI shells.

## 3. Community identity & structure

### 3.1 Data model

```
Community
  id                 uuid, pk
  slug               string, unique, citext, 3-40 chars  -- 0dot.in/c/slug
  name               string, 1-80 chars
  description        string, 0-500 chars
  avatar_url         string, nullable
  cover_url          string, nullable
  visibility         enum: public | private | restricted
  created_by         uuid, fk -> User
  member_count       integer, default 1  -- denormalized, same pattern as Phase 2 follow counts
  created_at         timestamp
  updated_at         timestamp
```

`visibility`:
- `public` — anyone can view content and join instantly.
- `restricted` — anyone can view content, but joining requires approval.
- `private` — content is only visible to members; the community itself is
  still discoverable by name/slug in search (name/existence isn't secret,
  only content is), matching the "long-term, stable URLs" and "transparent"
  principles from the roadmap rather than making entire communities invisible.

### 3.2 Slug rules

Reuses the exact reserved-word and character-validation approach from Phase 1
username rules (§3.2 of that spec) rather than inventing a second policy —
same allowlist of characters, same case-insensitive uniqueness, same
single-source-of-truth reserved list shared with the router. Community slugs
and usernames are in separate namespaces (a community can be `/c/design` while
a user is `/@design`), since they live under different path prefixes.

### 3.3 Acceptance criteria

- [x] Slug uniqueness and reserved-word checks are case-insensitive and shared
      with the routing layer, identical in spirit to Phase 1 §3.2 — see
      `src/lib/reserved-community-slugs.ts`.
- [ ] `private` communities never leak post/member content to non-members via
      any API response, including error messages that might otherwise reveal
      "this post exists but you can't see it" vs. "not found." — **N/A until
      community content exists** (posts/wiki/chat are later build-sequence
      steps); nothing to leak yet.
- [x] `restricted` communities queue join requests for moderator approval and
      do not grant membership until approved — verified live; `private`
      communities get the same treatment (see step 1's build notes — the
      spec doesn't pin this down for `private` explicitly, treated the same
      as `restricted` since ungated joining would defeat a private
      community's purpose).

## 4. Membership & roles

### 4.1 Data model

```
CommunityMember
  community_id   uuid, fk -> Community
  user_id        uuid, fk -> User
  role           enum: owner | moderator | member
  status         enum: active | pending | banned | muted
  joined_at      timestamp
  primary key (community_id, user_id)
```

- Exactly one `owner` per community (the creator, transferable later — transfer
  flow not specified in Phase 3, flag as a gap if needed sooner).
- `moderator` role covers the "Moderators" roadmap bullet: can remove
  posts/comments, mute/ban members, edit rules/wiki, pin posts. Owners have all
  moderator permissions plus the ability to appoint/remove moderators and
  delete the community.
- `status: pending` is only meaningful for `restricted` communities (§3.1); it
  represents a join request awaiting moderator action.
- `status: muted` — can view but not post/comment/chat.
- `status: banned` — cannot view (for private/restricted) or interact (for
  public) at all; distinguished from a platform-wide Phase 2 `Block` (§5.6 of
  the Phase 2 spec) — a community ban is scoped to that community only, it is
  not a signal that propagates anywhere else.

### 4.2 Acceptance criteria

- [ ] A banned member cannot rejoin by leaving and re-requesting (banned status
      persists independent of a leave action). — **N/A until moderation
      (step 2)**: no `banned` status exists yet in step 1.
- [ ] Muted members can still read but any write action (post, comment, chat
      message, poll vote) is rejected server-side, not just hidden in the UI.
      — **N/A until moderation/content (steps 2-3+)**.
- [x] Removing the last moderator/owner from a community is prevented, or the
      community is left in an explicitly-handled ownerless state — this must
      be a deliberate decision, not an accident of role-removal logic.
      Resolved: `leaveCommunity` (`src/app/actions/communities.ts`) rejects
      for the owner, deliberately, until ownership transfer is built.

## 5. Rules

### 5.1 Data model

```
CommunityRule
  id             uuid, pk
  community_id   uuid, fk -> Community
  position       integer  -- display order, dense per community
  title          string, 1-80 chars
  body           string, 0-500 chars
  created_at     timestamp
  updated_at     timestamp
```

Simple ordered list, editable by moderators/owner only. No per-user
acknowledgment/acceptance tracking in Phase 3 (e.g., "you must check a box to
join") — flag as a possible Phase 12 addition if legal/product wants
enforceable rule acceptance; not built speculatively now.

## 6. Tags

The roadmap's "Tags" bullet is ambiguous between two real things, and Phase 3
should build both, since they solve different problems and don't conflict:

- **Discovery tags** — topics attached to the `Community` itself (e.g.
  "design", "gaming"), used for search/browse filtering. Small controlled set
  (curated list, not free-text) to keep discovery browsable rather than
  fragmented across thousands of one-off tags.
- **Post flair** — an optional per-post label within a community (e.g.
  "Question", "Announcement", "Discussion"), defined per-community by
  moderators, used to filter the community's own feed. This is distinct from
  Phase 1's global `Hashtag` (§5.1 of that spec, still usable inside community
  posts for cross-community discovery) — flair is community-scoped and
  moderator-curated, hashtags are global and user-generated.

```
CommunityTag
  community_id   uuid, fk -> Community
  tag            string  -- from a shared curated taxonomy, not free text
  primary key (community_id, tag)

CommunityPostFlair
  id             uuid, pk
  community_id   uuid, fk -> Community
  label          string, 1-30 chars
  color          string  -- from a fixed palette, not free-form, same reasoning as Phase 1's theme presets (§3.6) to avoid design/accessibility drift
```

`Post` (Phase 1) gains a nullable `flair_id` — additive column, no migration
risk to existing rows.

## 7. Community posts, feed, and lightweight events

### 7.1 Extending Post rather than building a parallel system

`Post` (Phase 1 §5.1) gains a nullable `community_id`. A community post is
still authored by a `User` (`author_id` unchanged) and simply scoped to a
community — this directly resolves the author-model question Phase 1 flagged
and deferred (Phase 1 spec §7.1: whether `Post.author_id` needs to become
polymorphic). The answer for communities is **no**: members post into a
community, the community doesn't post as itself. That question remains open
only for Phase 4 business pages, which do need to post *as* the business —
worth carrying forward to that spec rather than resolving here.

This means likes, comments, reposts, bookmarks, hashtags, and mentions all
work inside communities for free, with zero new engagement modeling.

### 7.2 Community feed

- Per-community feed: `Post` rows where `community_id = X`, reverse-chronological,
  cursor-paginated — same mechanics as Phase 1/2 feeds.
- Pinned posts (moderator action, §4.1) render above the chronological list,
  most-recently-pinned first; `Post` gains a nullable `pinned_at` scoped
  meaning only within its community.
- **"Your Communities" aggregate feed** (posts across all communities the
  viewer is a member of, merged reverse-chronological) is a natural companion
  to Phase 2's Home/Explore split (§6.1 of that spec) — recommended as a third
  feed surface. Flag for product confirmation rather than assuming it's wanted;
  it's cheap to build (same query pattern as Home, swapping `Follow` for
  `CommunityMember`) but adds a third tab to the main nav, which is a product
  decision, not just an engineering one.

### 7.3 Lightweight "Events" (community bulletin, not the Phase 8 platform)

The roadmap lists "Events" under Phase 3 *and* a full standalone
`0dot.in/e/event` platform under Phase 8 — these must not become the same
system built twice. Phase 3's version is intentionally minimal:

```
CommunityEvent
  id             uuid, pk
  community_id   uuid, fk -> Community
  title          string, 1-120 chars
  description    string, 0-1000 chars
  starts_at      timestamp
  ends_at        timestamp, nullable
  location       string, nullable  -- free text, e.g. a URL or physical address; no venue/ticketing modeling
  created_by     uuid, fk -> User
```

No RSVP, ticketing, live-streaming, or recording (all explicitly Phase 8
scope). This is a bulletin-board entry, not an events product. If Phase 8 is
built before this distinction matters in practice, consider whether
`CommunityEvent` should simply be superseded/migrated into the Phase 8 model
rather than maintained as a second, permanent, parallel concept — flag now so
it isn't forgotten later.

### 7.4 Acceptance criteria

- [ ] A community post participates in the same like/comment/repost/bookmark
      mechanics as any Phase 1 post, with no separate code path.
- [ ] Pinned posts render above chronological order in the community feed only
      — pinning has no effect on that post's appearance in Home/Explore/global
      feeds.
- [ ] `CommunityEvent` has no RSVP/ticketing fields; a request for those is a
      signal to accelerate Phase 8, not to extend this table.

## 8. Polls

### 8.1 Data model

```
Poll
  id             uuid, pk
  post_id        uuid, fk -> Post, unique  -- a poll is an attachment to exactly one post
  closes_at      timestamp
  allows_multiple_choice  boolean, default false

PollOption
  id             uuid, pk
  poll_id        uuid, fk -> Poll
  label          string, 1-80 chars
  position       integer

PollVote
  poll_option_id  uuid, fk -> PollOption
  user_id         uuid, fk -> User
  created_at      timestamp
  primary key (poll_option_id, user_id)  -- for single-choice, application layer removes any prior vote on other options in the same poll before inserting
```

- Poll results are visible to everyone immediately (no "hide until you vote"
  gating in Phase 3 — simpler and avoids a class of "did I already see this"
  edge cases; revisit only if explicitly requested).
- After `closes_at`, votes are rejected server-side; results remain visible.
- Polls are not community-exclusive — the schema attaches a poll to any `Post`,
  so this also lightly benefits the general feed, not just communities. That's
  a side effect of building it as a `Post` attachment rather than
  community-specific, and is worth calling out as intentional reuse, not scope
  creep.

### 8.2 Acceptance criteria

- [ ] A single-choice poll vote replaces the voter's prior choice rather than
      allowing two simultaneous votes.
- [ ] Votes after `closes_at` are rejected with a clear error, not silently
      dropped or silently accepted.

## 9. Q&A

Modeled as a `Post` variant rather than a new content system, same reasoning
as Polls:

```
Post gains:
  post_type          enum: standard | question, default standard
  accepted_answer_id uuid, fk -> Post, nullable  -- only meaningful when post_type = question, must reference a reply to this post
```

- Any reply (`reply_to_id` referencing the question, per Phase 1 §5.3) is a
  candidate answer. The question's author (or a moderator) can mark one reply
  as `accepted_answer_id`.
- Answer voting reuses the existing `like` engagement (Phase 1 §5.3) rather
  than introducing a separate upvote/downvote primitive — an explicit
  simplification versus typical Q&A products (which often support downvotes);
  downvoting is a moderation/quality signal that overlaps with Phase 12 Trust &
  Safety territory more than content modeling, so it's deferred rather than
  built as a half-feature here.

### 9.1 Acceptance criteria

- [ ] Only a reply to the question (not an arbitrary post) can be set as
      `accepted_answer_id`.
- [ ] Marking an accepted answer is restricted to the question's author or a
      community moderator, enforced server-side.

## 10. Wiki

### 10.1 Data model

```
WikiPage
  id             uuid, pk
  community_id   uuid, fk -> Community
  slug           string  -- unique per community, e.g. /c/design/wiki/style-guide
  title          string, 1-120 chars
  current_revision_id  uuid, fk -> WikiRevision

WikiRevision
  id             uuid, pk
  wiki_page_id   uuid, fk -> WikiPage
  body           text  -- rendered as sanitized markdown, never raw HTML (same posture as Phase 1 §7.2 on user content)
  edited_by      uuid, fk -> User
  created_at     timestamp
```

- Full revision history retained (every edit creates a new `WikiRevision`,
  `current_revision_id` repointed) — this is also directly useful groundwork
  for Phase 13's "version history" requirement, so it's worth building the
  append-only revision pattern correctly now rather than retrofitting it later.
- Edit permission: configurable per community between "moderators only" and
  "any member" (default: moderators only, matching a wiki's usual
  vandalism-resistance needs before a community has established norms).
- No diff/merge UI required in Phase 3 — revision history storage is the
  requirement; a nice diff view is a polish item, not a data-model concern.

### 10.2 Acceptance criteria

- [ ] Every wiki edit is retained as a distinct revision; no in-place overwrite
      that loses prior content.
- [ ] Wiki body is rendered as sanitized markdown; raw HTML/script injection
      is rejected the same way Phase 1 rejects it in bios and post bodies.

## 11. Live chat

### 11.1 Why this is a new model, not reused Phase 2 Messaging

Phase 2's `Conversation`/`Message` model (§5.1 of that spec) is built around
small participant sets with per-participant read cursors — appropriate for DMs
and group chats, wrong shape for a single broadcast channel with potentially
thousands of members. Live chat gets its own lightweight model:

```
CommunityChatMessage
  id             uuid, pk
  community_id   uuid, fk -> Community
  sender_id      uuid, fk -> User
  body           string, 1-500 chars
  created_at     timestamp
  deleted_at     timestamp, nullable  -- moderator removal, tombstoned not hard-deleted (modlog accountability, §9 below... see community moderation)
```

- No per-user read receipts or unread counts — impractical at chat volume and
  not how live chat products behave (it's a stream, not an inbox).
- Rate-limited per user per community (exact threshold an infra/ops decision,
  same posture as Phase 1 §7.2's rate-limiting requirement) to prevent flood
  spam.
- Real-time transport (WebSocket) is an infra concern outside this spec, same
  as every other real-time mention in this document; the API contract is:
  send message, fetch recent history (cursor-paginated, most recent first),
  moderator delete.

### 11.2 Acceptance criteria

- [ ] Chat messages from a muted (§4.1) member are rejected server-side.
- [ ] Moderator-deleted messages are removed from the live view for all
      clients and do not reappear on reconnect/history fetch.

## 12. Voice rooms

### 12.1 Scope warning

Real-time group voice (à la Discord voice channels or Twitter Spaces) is a
categorically larger infrastructure investment than everything else in this
phase — it requires real-time audio transport (WebRTC/SFU), speaker/listener
state, and device permission handling that has no analog elsewhere in Phase
1–3. This should be explicitly confirmed with product/infra before
committing to it as part of Phase 3 rather than assumed to fit the same
timeline as rules/tags/polls.

### 12.2 Recommended MVP shape (if greenlit)

Scoped-down "scheduled voice session" rather than always-on voice channels:

```
VoiceRoom
  id             uuid, pk
  community_id   uuid, fk -> Community
  title          string, 1-120 chars
  status         enum: scheduled | live | ended
  starts_at      timestamp
  ended_at       timestamp, nullable
  created_by     uuid, fk -> User

VoiceRoomParticipant
  voice_room_id  uuid, fk -> VoiceRoom
  user_id        uuid, fk -> User
  role           enum: speaker | listener | requesting_to_speak
  joined_at      timestamp
```

- Only `speaker`s transmit audio; `listener`s can request to speak
  (`requesting_to_speak`), promoted by a moderator/host.
- No recording/playback in Phase 3 (recording is explicitly a Phase 8 events
  feature) — a voice room's audio is live-only and not retained, which also
  sidesteps a chunk of Phase 12/13 content-moderation-of-recordings scope this
  phase shouldn't need to solve yet.

### 12.3 Acceptance criteria (if built)

- [ ] A `listener` cannot transmit audio without being promoted to `speaker`,
      enforced at the transport/session layer, not just UI state.
- [ ] Ending a voice room stops all audio transport and does not retain a
      recording.

## 13. Community moderation & minimal safety tooling

Pulled forward from Phase 12, same reasoning Phase 2 used for `Block` (§5.6 of
that spec): communities cannot be moderated responsibly with zero tooling, but
this phase should not build the full Phase 12 apparatus (platform-wide
reports queue, appeals, automated bot/spam detection).

```
ModAction
  id             uuid, pk
  community_id   uuid, fk -> Community
  moderator_id   uuid, fk -> User
  action         enum: remove_post | remove_comment | remove_chat_message | mute_member | ban_member | pin_post | edit_rule | edit_wiki
  target_type    enum: post | chat_message | user | rule | wiki_page
  target_id      uuid
  reason         string, nullable
  created_at     timestamp
```

- Every moderator action listed above writes a `ModAction` row — this is the
  community-scoped "modlog," visible to other moderators (transparency within
  the mod team) and optionally to all members depending on community settings
  (transparency to the community, a product decision worth flagging, not
  assuming either default).
- No member-facing "report" button or appeals workflow in Phase 3 — that's
  Phase 12. Moderators act on what they see; there's no formal escalation path
  yet. Flag this gap explicitly rather than half-building an appeals flow.
- This `ModAction` log doubles as a direct precedent for Phase 14's "audit
  logs" requirement — same append-only, actor-attributed pattern, worth
  reusing the shape rather than inventing a different one later.

### 13.1 Acceptance criteria

- [ ] Every moderation action in the enum list produces exactly one `ModAction`
      row, attributable to the acting moderator.
- [ ] Non-moderators cannot perform any action in the `ModAction.action` enum,
      enforced server-side.

## 14. Community analytics

Owner/moderator-facing, following the same pattern as Phase 1's link analytics
(§4.3 of that spec: denormalized counters for fast display, an append-only
event log as source of truth for time-series views, no per-visitor
identification retained):

- Member growth over time (joins/leaves per day).
- Post/comment volume over time.
- Active member count (posted, commented, or chatted within last 7/30 days).
- Top posts by engagement within the community.

No cross-community benchmarking or comparison in Phase 3 (e.g., "your
community ranks #4 in Design") — that's an easy scope-creep item with no
clear owner-facing value yet and real questions about fairness/gaming; leave
for later if actually requested.

## 15. Notifications: new producers

Resolving Phase 2's stubbed `community_update` type (§4.1 of that spec):

- `community_update` fires for structural/announcement-level changes: rule
  edits, wiki edits, being promoted to moderator, a join request being
  approved. It remains a catch-all for "something changed about the
  community," not for content activity.
- Content-level activity (someone replied to your community post, your
  question got an accepted answer, your poll closed) reuses the *existing*
  `comment`/`mention` notification types from Phase 2 rather than growing the
  enum further — communities don't need their own parallel notification
  taxonomy for things that are still fundamentally posts and replies.
- One genuinely new type is needed: `community_invite` (someone invited you to
  a `private`/`restricted` community) — no existing type covers this
  semantically.

## 16. Search integration

Resolving Phase 1's empty "communities" search tab (§6.1 of that spec):

- Communities become searchable by `name` and `slug` (prefix + fuzzy, same
  Postgres full-text approach as Phase 1 users/posts — no new search
  infrastructure needed at this scale).
- Ranking: exact slug match first, then name match, tie-broken by
  `member_count` — mirrors the exact-then-fuzzy-then-tiebreak pattern Phase 1
  established for user search (§6.3 of that spec) rather than inventing a
  different ranking philosophy for a second entity type.
- `private` community content (posts, wiki, chat) is never indexed/returned in
  search results to non-members; the community's existence (name/slug/member
  count) is still searchable per the visibility model in §3.1.

## 17. Cross-cutting concerns

### 17.1 Security

- Wiki and rules content sanitized the same way as bios/post bodies (Phase 1
  §7.2) — no raw HTML anywhere user-authored content is rendered.
- Post flair colors constrained to a fixed palette (§6), same reasoning as
  Phase 1 profile themes (§3.6): user/moderator customization without an XSS
  or accessibility-contrast surface.
- All new write endpoints (posts, chat, polls, wiki edits, mod actions) need
  rate limiting, consistent with the requirement already stated in Phase 1
  §7.2 and Phase 2 §5 — not re-litigated per endpoint here, just confirmed as
  still required.

### 17.2 Privacy

- `private` community membership lists are visible only to other members, not
  the general public — a departure from Phase 2's default of public
  follower/following lists (§3.4 of that spec), justified because community
  membership can reveal sensitive affiliations (support groups, niche
  interests) in a way that following a public creator typically doesn't.
- Live chat and voice room participation are not retained as a public,
  permanent record the way posts are — chat messages are soft-deletable by
  moderators and voice rooms aren't recorded at all (§12.2).
- Community, wiki, and live-chat UI meet the accessibility standing
  requirement from Phase 1 §7.3 — not restated in full per phase from here
  on.

## 18. Explicit open questions for product sign-off

- Is voice rooms in scope for this phase at all, given the infra investment
  called out in §12.1 — or should it be split into its own later phase/spec?
- Should the "Your Communities" aggregate feed (§7.2) ship as a third main-nav
  tab alongside Home/Explore, or is per-community feed navigation sufficient
  for launch?
- Should community modlogs (§13) be member-visible by default, moderator-only
  by default, or configurable per community?
- Rule acceptance: does joining a community need an explicit "I agree to the
  rules" acknowledgment, or is posting the rules sufficient for Phase 3?
- `CommunityEvent` (§7.3): confirm this stays a bulletin-board-only feature and
  won't accrete RSVP/ticketing scope before Phase 8 exists — a real risk given
  how naturally "just add RSVP" requests tend to show up once an event has a
  date on it.

## 19. Suggested build sequence within Phase 3

1. `Community` + slug reservation/validation (reuses Phase 1 patterns) +
   `CommunityMember` with `owner` role only — a community must exist and be
   joinable before anything else matters.
2. Moderator role + minimal `ModAction` log (§13) — required before any
   content moderation tooling below it is safe to expose.
3. `Post.community_id` + community feed + pinning (§7.1–7.2) — the core
   content loop.
4. Rules (§5) and discovery/flair tags (§6) — low-risk, no dependencies.
5. Polls (§8) and Q&A (§9) — both are `Post` extensions, natural next step
   once the core post loop is stable.
6. Wiki (§10) — independent of posts, can be built in parallel with step 5.
7. Live chat (§11) — needs its own real-time transport work; sequence after
   the above so infra effort isn't split across two real-time features at
   once.
8. Search integration (§16) and notification producers (§15) — depend on the
   entities above existing, naturally land after them.
9. Community analytics (§14) — depends on there being real usage data to
   analyze; lowest priority for launch-readiness.
10. Voice rooms (§12) — sequence last, and only after the §18 scope question
    is answered, given the infra cost flagged in §12.1.
