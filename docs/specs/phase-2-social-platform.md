# Phase 2 — Social Platform Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md)

## 1. Purpose & Scope

Phase 2 turns the standalone profile/feed from Phase 1 into a social graph: people
can follow each other, message each other, and get notified when something
involving them happens. This phase also resolves an open question left in Phase 1
(§5.4 of the Phase 1 spec): once a follow graph exists, "home feed" can finally mean
what users expect it to mean — see §6.1 below.

**In scope:** Follow system, direct/group messaging, notifications.
**Out of scope:** Communities (Phase 3), business accounts (Phase 4), any
monetization, AI-driven recommendations (Phase 11), full Trust & Safety tooling
(Phase 12) — though a minimal block primitive is pulled forward here as a hard
dependency of shipping messaging safely (see §5.6).

## 2. Success Criteria

- A user can follow/unfollow another account with the change reflected in their
  own home feed within one request-response cycle (no stale feed after follow).
- A user can send a DM to anyone who follows them, or anyone they follow, without
  it landing in spam; a DM from a stranger lands in a clearly separate requests
  inbox, never the primary inbox.
- [x] A user is notified (in-app) of a like, comment, mention, new follower, or
  new message within seconds of it happening, without needing to refresh —
  all five producers publish to the same per-user SSE bus messaging already
  used (`src/lib/message-events.ts`, `src/lib/notifications.ts`); no separate
  transport per notification type.
- No message content is ever readable by another user who isn't a participant in
  that conversation, enforced at the query layer, not just the UI.

## 3. Follow System

### 3.1 Data model

```
Follow
  follower_id    uuid, fk -> User
  followee_id    uuid, fk -> User
  created_at     timestamp
  primary key (follower_id, followee_id)
  check (follower_id != followee_id)
```

No approval/request state in Phase 2 — profiles are public by default (per Phase 1
§3.4), so following is a single-step, unilateral action, same as the Phase 1
decision not to build private profiles. If private accounts are introduced later
(Phase 12 candidate), this table gains a `status` column (`pending|accepted`)
rather than needing a new table — worth noting now so it isn't a surprise later,
but not building it speculatively today.

Counts (`follower_count`, `following_count`) are denormalized onto `Profile`
(added in this phase), updated transactionally with the `Follow` row write, same
pattern as Phase 1's post engagement counts.

### 3.2 Verified creators

Phase 1 already has `Profile.is_verified` (manually granted, no self-serve flow).
Phase 2 doesn't change how verification is granted — it just adds surface area
that reads the flag:
- [x] A verified badge renders in follow lists, search results, and
  notifications — all three now covered (`UserListItem`, `/search`'s users
  and posts tabs, `/notifications` and `ContextualRail`'s preview).
- [x] Verified accounts get a ranking boost in Suggested Users (§3.3) and Search
  (per Phase 1 §6.3, which already specifies `is_verified` as a tie-break).

No new entity needed here — flagging this section mainly to confirm no separate
"creator" concept is being requested beyond the existing verification flag.

### 3.3 Suggested users

Phase 2 has no engagement history deep enough for ML-driven recommendations
(that's Phase 11 territory). Ranking is a simple weighted heuristic, computed
on read (not precomputed) given expected volume at this stage:

1. Mutual follows (accounts followed by people the viewer already follows) —
   highest weight.
2. Verified accounts — moderate weight.
3. Recently active accounts (posted within last 7 days) — small weight.
4. Exclude: accounts the viewer already follows, the viewer themself, and any
   account that has blocked the viewer or that the viewer has blocked (§5.6).

This is intentionally simple and explicitly flagged as a placeholder — revisit
when there's enough interaction data for the Phase 11 AI recommendation system
to take over, rather than investing in a bespoke scoring model now.

### 3.4 Follower/following lists

- Public by default (matches Phase 1's no-private-profile decision). No setting
  to hide your following/follower list in Phase 2 — flag as a Phase 12 privacy
  candidate if requested, not built speculatively now.
- Paginated, cursor-based (`created_at` + composite id), same pattern as Phase 1
  feed pagination — consistency here avoids a one-off pagination style just for
  this list.

### 3.5 Acceptance criteria

- [x] Following/unfollowing is idempotent (double-follow is a no-op, not an
      error) and updates counts immediately for the acting user.
- [~] A user cannot follow themself — enforced at the **app layer**
      (`followUser`, `src/app/actions/follow.ts`), not a DB constraint;
      documented as a deliberate deviation in `schema.prisma`'s `Follow`
      model comment (SQLite/Prisma has no `@@check` in this setup). Not
      bypassable by any client, but not literally what this line asks for.
- [x] Suggested users never include accounts already followed, the viewer, or
      any account in a blocking relationship with the viewer.
- [x] Follower/following lists paginate without duplicate or skipped entries.

## 4. Notifications

(Covered before Messaging because both Follow and Messaging produce
notifications, and it's easier to specify the sink before the sources.)

### 4.1 Data model

```
Notification
  id             uuid, pk
  recipient_id   uuid, fk -> User
  actor_id       uuid, fk -> User, nullable  -- null for system notifications
  type           enum: like | comment | mention | new_follower | message | community_update
  subject_type   enum: post | message | user | community
  subject_id     uuid
  read_at        timestamp, nullable
  created_at     timestamp
```

`community_update` is included in the enum now even though communities don't
exist until Phase 3 — same forward-compatibility approach as Phase 1's
search-tabs decision (§6.1 of that spec): the schema anticipates the type so
Phase 3 only needs a producer, not a notification-system redesign. No code path
in Phase 2 ever writes this type.

### 4.2 Aggregation

Un-aggregated notifications ("Alice liked your post", "Bob liked your post",
"Carol liked your post" as three rows) are correct but noisy at any real volume.
Phase 2 aggregates for display: notifications of the same `type` + `subject_id`
within a rolling time window are grouped into one feed item ("Alice and 12
others liked your post"), computed at read time from the raw rows above rather
than maintaining a separate aggregate table — keeps the write path simple and
the aggregation logic changeable without a migration.

`mention`, `new_follower`, and `message` are not aggregated the same way (each
mention/follow/message is independently meaningful); only `like` and `comment`
volume benefits from grouping.

### 4.3 Delivery

- **In-app**: a notification bell with unread count, backed by a live count
  query; new notifications should appear without a manual refresh. Real-time
  transport (WebSocket vs. short-poll) is an infra decision, not specified here,
  but the API contract is: an endpoint to list notifications (cursor-paginated)
  and an endpoint to mark read (single + mark-all).
- **Push/email**: explicitly out of scope for Phase 2. Push needs device tokens,
  which need the Phase 15 mobile apps (or a PWA push subscription) to exist
  first; email digests are a nice-to-have that can be layered on without
  changing this schema. Flagging so it isn't assumed to ship silently alongside
  in-app.

### 4.4 Read state

- `read_at` is set per-notification when the recipient views their notification
  list (mark-as-read on view, not on click-through) — matches common feed
  conventions and keeps the unread badge meaningful without extra client logic
  per item.
- No per-notification delete in Phase 2; notifications age out of relevance
  naturally via the feed being reverse-chronological. Bulk "clear all" (soft
  delete) is a reasonable cheap addition — include it, since it's a single
  bulk-update endpoint, not new modeling.

### 4.5 Acceptance criteria

- [x] Liking a post the recipient's already been notified about (by someone
      else) within the aggregation window updates the existing grouped item
      rather than creating a visually separate one — including when another,
      different notification (e.g. a new follower) arrives in between;
      `groupRows` (`src/app/notifications/page.tsx`) tracks the open group
      per `type:subjectId`, not just "does this row match the immediately
      preceding one."
- [x] Unread count reflects reality after mark-read actions without requiring a
      full page reload.
- [x] A blocked user's actions (like, follow, mention) never generate a
      notification for the person who blocked them (ties to §5.6).
- [x] `community_update` never appears in Phase 2 — verified by the absence of
      any producer, not by hiding it in the UI.

## 5. Messaging

### 5.1 Data model

```
Conversation
  id             uuid, pk
  kind           enum: direct | group
  title          string, nullable  -- group chats only; direct conversations have no title
  created_by     uuid, fk -> User
  created_at     timestamp

ConversationParticipant
  conversation_id     uuid, fk -> Conversation
  user_id             uuid, fk -> User
  role                enum: member | admin  -- admin meaningful for group only
  joined_at           timestamp
  last_read_message_id  uuid, fk -> Message, nullable
  primary key (conversation_id, user_id)

Message
  id              uuid, pk
  conversation_id uuid, fk -> Conversation
  sender_id       uuid, fk -> User
  body            text, nullable  -- nullable if attachment-only
  attachment      jsonb, nullable  -- {type: file|voice_note, url, size_bytes, duration_s?, mime_type}
  created_at      timestamp
  deleted_at      timestamp, nullable  -- [x] soft delete, sender-only, content cleared
                                        -- immediately rather than deferring to a retention
                                        -- window (sidesteps the §7 open question rather
                                        -- than guessing at an answer) — src/app/actions/
                                        -- messages.ts's deleteMessage

MessageRequestState
  conversation_id  uuid, fk -> Conversation, unique
  status           enum: pending | accepted | declined
  initiated_by     uuid, fk -> User
```

`direct` conversations always have exactly 2 participants; enforced at the
application layer (not a DB constraint, since group size limits are also
application-level policy, not schema-level).

### 5.2 Message requests

A DM from someone the recipient doesn't follow (and isn't followed by) creates
a `Conversation` in `pending` state, visible to the recipient in a separate
"requests" list, not the primary inbox — this is the minimum viable
anti-spam measure and is treated as required, not optional, for launch (see
§5.6 on why safety-adjacent scope is pulled forward from Phase 12). Accepting
moves it to `accepted` and it behaves like any other conversation from then on;
declining hides it from the recipient without notifying the sender.

Mutual-follow or one-directional-follow (either direction) conversations skip
the request state entirely and start `accepted`.

### 5.3 Group chats

- Any member can add participants (simplest policy for launch); only `admin`
  role can remove participants or change the title. Creator is `admin` by
  default.
- Max participants: 250 (soft cap, matches the reasoning in Phase 1's link cap —
  a number to confirm with product, not a hard architectural limit).
- Leaving a group chat removes the participant row but does not delete the
  conversation or its message history for remaining members.

### 5.4 Attachments

- **File sharing**: arbitrary file upload via the same pre-signed-URL pattern as
  Phase 1 post media (§5.2 of the Phase 1 spec) — reuse rather than build a
  second upload pipeline. Size cap TBD with infra (flag, not invent).
- **Voice notes**: audio attachment with a duration cap (recommend 2 minutes as
  a starting point, confirm with product) and required `duration_s` so the
  client can render a duration label without downloading the file.
- Attachments are not scanned/moderated for content in Phase 2 — that's Phase 12
  Trust & Safety scope; flag as a known gap rather than silently building
  partial moderation here.

### 5.5 Read state & delivery

- `last_read_message_id` per participant (not per-message read receipts) keeps
  the write path cheap: one row update per "mark conversation read," not one
  row per message per recipient. Unread count for a conversation is derived
  (messages after that ID), and unread badge on the inbox is a count of
  conversations with unread messages.
- Typing indicators, if built, are ephemeral (transport-layer, e.g. a WebSocket
  event) and intentionally not persisted anywhere in this schema.
- Real-time delivery transport is an infra decision outside this spec's scope,
  but the API contract must support: list conversations (cursor-paginated, most
  recent activity first), list messages in a conversation (cursor-paginated),
  send message, mark-read.

### 5.6 Minimal blocking (pulled forward from Phase 12)

Messaging cannot ship responsibly without at least a block primitive, even
though full Trust & Safety tooling (reports, appeals, spam/bot detection) is
Phase 12 scope. Minimum for Phase 2:

```
Block
  blocker_id   uuid, fk -> User
  blocked_id   uuid, fk -> User
  created_at   timestamp
  primary key (blocker_id, blocked_id)
```

Effects: a blocked user cannot start a new conversation with the blocker
(existing conversations are hidden from the blocker's inbox, not deleted), cannot
follow the blocker (existing follow, if any, is removed on block), and their
notifications to the blocker are suppressed (§4.5). This is the one piece of
Phase 12 scope treated as a hard dependency rather than deferred, and should be
called out as such if it causes a sequencing question — do not build reporting,
appeals, or automated detection alongside it.

### 5.7 Security & privacy

- [x] Message content encrypted at rest at minimum (column/table-level
  encryption) — implemented: `src/lib/message-crypto.ts`, AES-256-GCM,
  app-managed key (`MESSAGE_ENCRYPTION_KEY` env var). Covers `Message.body`
  and `Conversation.lastMessagePreview` (a literal copy of message content,
  so it needs the same treatment). Full end-to-end encryption remains an
  explicit **non-goal** for Phase 2 — flagging this clearly since "secure by
  design" is a stated core principle and silence here could be read as an
  oversight rather than a scoping decision. E2E encryption, if wanted, is a
  substantial separate effort (key management, multi-device) that deserves
  its own spec, not a bullet point here.
- Query-layer enforcement: every message/conversation read must verify the
  requesting user is a current `ConversationParticipant` — this is a data-layer
  check, not just a UI-level hide, since it's the actual privacy guarantee in
  §2's success criteria.
- Message retention/deletion policy (how long after "delete for everyone," if
  offered, before it's unrecoverable) needs legal/product input — flagged as
  open, matching the same treatment Phase 1 gave account-deletion retention.
- Notification bell, inbox, and conversation UI meet the accessibility
  standing requirement from Phase 1 §7.3 (keyboard navigation, screen-reader
  compatibility, WCAG contrast) — not restated in full per phase from here on.

### 5.8 Acceptance criteria

- [x] A DM from a non-mutual, non-followed sender lands in the recipient's
      requests list, not their primary inbox.
- [x] Declining a request hides it from the recipient without notifying the
      sender.
- [x] A user cannot read messages in a conversation they are not a participant
      in, even with a guessed/enumerated conversation ID.
- [x] Blocking a user immediately prevents new messages, removes any existing
      follow relationship in both directions, and hides (not deletes) shared
      direct-conversation history from the blocker. Group chats are handled
      differently by design (§5.6 only defined this for direct conversations):
      blocking never removes anyone from a shared group or breaks it for
      other members — a blocked member's messages are simply filtered out of
      the blocker's own view (`getMessagesForConversation`,
      `src/lib/messaging.ts`), matching how Slack/Discord/Telegram treat a
      1:1 block inside a multi-party space.
- [x] Group chat admin-only actions (remove member, rename) are rejected for
      non-admin members at the API layer, not just hidden in the UI.
- [x] Marking a conversation read updates the unread badge without requiring a
      full inbox reload.

## 6. Interactions with Phase 1

### 6.1 Resolving the Phase 1 home-feed open question

Phase 1 shipped a global chronological feed because no follow graph existed yet
(explicitly flagged as an open question in that spec, §7.5). With `Follow` now
in place, Phase 2 should split feed into:
- **Home**: posts from accounts the viewer follows, plus their own posts,
  reverse-chronological, cursor-paginated — same pagination mechanics as Phase
  1, just a filtered author set (`author_id IN (following) OR author_id = self`).
- **Explore/global**: the Phase 1 behavior, kept as a separate surface rather
  than removed, so there's still a discovery feed for accounts you don't yet
  follow.

Implementation note: this is a fan-out-on-read query (join against `Follow` at
request time), not a precomputed timeline table. That's appropriate at Phase 2
scale; fan-out-on-write (a materialized per-user timeline) is a scale-driven
optimization to revisit later, not something to build preemptively now.

### 6.2 Trending — a third feed, not a mode of Explore

The roadmap names `0dot.in/trending` as its own top-level URL alongside
`/feed` and `/explore`, distinct from both `Home` and `Explore` above.
`Explore` is the Phase 1 global feed — reverse-chronological, no ranking
signal beyond recency. `Trending` needs a genuinely different query: posts
ranked by *velocity* of engagement (likes/comments/reposts per unit time
since posting), not just recency or a plain engagement total, so that an
old post with many likes accumulated slowly doesn't outrank a new post
picking up engagement fast — the entire point of a "trending" surface is
surfacing what's accelerating right now, not what's simply popular
lifetime-to-date.

```
Post gains:
  trending_score   decimal  -- recomputed periodically (e.g. every few
                             -- minutes) from a time-decayed function of
                             -- recent like/comment/repost counts, not
                             -- computed synchronously per request
```

This is a denormalized, periodically-recomputed field — the same
"never computed synchronously during a request" posture used for cached
metadata throughout this series (e.g. Phase 6 §5.2's GitHub metadata sync)
— rather than a live aggregation query on every page load. Exact decay
function/recompute interval is a tuning detail, not fixed here; the
requirement is that `Trending` is a real, separately-ranked feed, not a
renamed view of `Explore`.

- [x] Recompute is a real background job, not a per-request computation:
  `instrumentation.ts` (project root) starts an in-process scheduler
  (`startTrendingScheduler`, `src/lib/trending.ts`) once at server startup,
  which calls `recomputeTrendingScores` on the `RECOMPUTE_INTERVAL_MS`
  cadence. `trending/page.tsx`'s `ensureTrendingScoresFresh()` call remains
  as a defense-in-depth staleness check, not the primary trigger — with the
  scheduler running it almost always short-circuits instantly rather than
  doing synchronous work inside a request.

### 6.3 No changes required to Phase 1 schema

Follow, Notification, and Messaging are additive tables; no Phase 1 table
requires a migration to support Phase 2. This was a deliberate Phase 1 design
goal (see Phase 1 spec §7.1) and holds here.

## 7. Explicit open questions for product sign-off

- Message requests: is a binary accept/decline sufficient, or is a
  "report and block" action needed directly from the request inbox at launch
  (pulling slightly more Phase 12 scope forward)?
- Group chat size cap (250 suggested) and file/voice-note size/duration caps —
  need infra/product confirmation, not architecturally load-bearing either way.
- "Delete for everyone" on messages: **resolved pragmatically, not by
  product sign-off** — offered (sender-only), with content cleared
  immediately on delete rather than after a retention window, sidestepping
  the "what window" question rather than answering it. Revisit if product
  wants an undo/grace-period instead.
- Should follower/following lists be hideable per-account in this phase, or is
  that acceptable to defer to Phase 12 privacy work?
- Push/email notification delivery: confirmed out of scope for Phase 2, or does
  an email digest need to ship alongside in-app given no mobile app exists yet
  to justify waiting?

## 8. Suggested build sequence within Phase 2

1. `Follow` table + follow/unfollow endpoints + denormalized counts.
2. Split Home vs. Explore feed using the follow graph (resolves §6.1).
3. `Block` primitive (§5.6) — needed before messaging ships, not after.
4. `Notification` table + producers for existing Phase 1 events (like, comment,
   mention) plus the new `new_follower` event.
5. In-app notification list + unread badge + mark-read.
6. `Conversation`/`ConversationParticipant`/`Message` for direct messages only
   (group chat deferred within this step).
7. Message requests flow (§5.2) — required before messaging is spam-safe to
   launch, not an add-on.
8. Group chat support (add/remove participants, admin role, title).
9. File and voice-note attachments (reuse Phase 1 upload pipeline).
10. Notification aggregation (§4.2) and Suggested Users (§3.3) — polish/ranking
    items, safe to interleave once the above are stable.
11. `Trending` feed (§6.2) — depends on step 2's feed infrastructure existing;
    lowest-priority of this phase's feed work, safe to ship after Home/Explore
    are stable.
