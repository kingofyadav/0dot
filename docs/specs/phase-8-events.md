# Phase 8 — Events Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md)

## 1. Purpose & Scope

Phase 8 introduces `0dot.in/e/event` — conferences, meetups, tickets, RSVP,
live streaming, and recordings. This phase also closes out three things
earlier phases deliberately deferred to it by name:

- Phase 3's `CommunityEvent` (§7.3 of that spec) was explicitly a bulletin-
  board placeholder with a standing note to revisit superseding it once a
  real events platform existed — this phase supersedes it (§7).
- Phase 5's `Livestream` shipped with no recording/VOD, explicitly deferring
  that to "Phase 8 events" (Phase 5 §8.2) — this phase builds it (§6).
- Phase 3's `VoiceRoom` shipped with no recording for the same reason
  (Phase 3 §12.2) — this phase revisits that too, with a new legal caveat
  attached (§6.3) that didn't apply when recording didn't exist yet.

**In scope:** a full `Event` entity hostable by a user, business, or
community; RSVP; paid ticketing (reusing Phase 5's payment backbone);
optional native livestream/voice-room attachment with recording; migrating
`CommunityEvent` onto this system.
**Out of scope:** capacity waitlisting (a hard cap without a queue is built
instead, see §4.3), community-hosted *paid* ticketing (RSVP-only for
communities in this phase, see §5.3), in-house video conferencing for
externally-hosted virtual events (an event can simply link out to Zoom/Meet/
etc. — native livestream/voice-room attachment is optional polish, not a
launch dependency, see §6.1).

## 2. Success Criteria

- An event can be hosted by a user, a business, or a community, using one
  consistent hosting model rather than three.
- A purely virtual event with an external meeting link can be created and
  ticketed with zero dependency on this phase's real-time infrastructure —
  native livestreaming is additive, not required.
- Every existing `CommunityEvent` is migrated to a real `Event` with no
  functionality regression, and the old table is retired, not left running
  alongside the new one indefinitely.
- Ticket purchases flow through the exact same `PaymentTransaction` ledger
  Phase 5 built, proving that backbone was in fact reusable across phases,
  not just within one.

## 3. Event identity and hosting

### 3.1 Data model

```
Event
  id                          uuid, pk
  slug                        string, unique, citext, 3-60 chars  -- 0dot.in/e/slug
  hosted_by_user_id           uuid, fk -> User, nullable
  hosted_by_business_id       uuid, fk -> Business, nullable
  hosted_by_community_id      uuid, fk -> Community, nullable
  -- exactly one of the three hosted_by_* columns is set
  created_by                  uuid, fk -> User  -- the individual who created/manages the record, kept distinct from the host for audit, same acting-individual-vs-owning-entity split as Post.author_id/business_author_id (Phase 4 §5)
  title                       string, 1-160 chars
  description                 text  -- sanitized markdown, standard posture since Phase 1 §7.2
  cover_image_url             string, nullable
  format                      enum: in_person | virtual | hybrid
  location                    string, nullable  -- required if format != virtual
  virtual_join_url            string, nullable  -- external meeting link (Zoom, Meet, etc.); independent of native livestream/voice-room attachment, see §6.1
  starts_at                   timestamp
  ends_at                     timestamp, nullable
  timezone                    string  -- IANA name, stored explicitly, same reasoning as Phase 4's AvailabilityRule (§10.2 of that spec)
  status                      enum: draft | published | cancelled
  capacity                    integer, nullable  -- hard cap on total attendees (RSVP + tickets combined), no waitlist (§4.3)
  attendee_list_visibility    enum: public | attendees_only | host_only
  created_at                  timestamp
  updated_at                  timestamp
```

### 3.2 A second three-way owner, same discipline as the first

This is the second entity in the system with a three-way nullable-owner
column set, after `WikiPage` (Phase 7 §5.1). The same idiom applies for the
same reason: real per-type foreign keys with an enforced exactly-one
constraint, not a generic polymorphic `owner_type`/`owner_id` pair — keeping
referential integrity intact rather than trading it away for flexibility this
system hasn't needed twice, let alone a third time. If a fourth host type is
ever needed (e.g. a standalone "Organization" concept distinct from
`Business`), that's the point to reconsider the polymorphic-association
alternative specifically for hosting — not before, and not as a reason to
also revisit `WikiPage`'s unrelated instance of the same idiom.

### 3.3 Slug rules

Fifth reuse of the single shared reserved-word/character validation function,
after usernames (Phase 1 §3.2), community slugs (Phase 3 §3.2), business
slugs (Phase 4 §3.1), and project slugs (Phase 6 §3.2).

### 3.4 Acceptance criteria

- [ ] Exactly one of `hosted_by_user_id`/`hosted_by_business_id`/
      `hosted_by_community_id` is set; zero or multiple is rejected at write
      time.
- [ ] `location` is required when `format != virtual`.
- [ ] Event slug validation/reservation shares the identical source used by
      the other four namespaces.
- [ ] A `draft` event is visible only to its host/creator; only `published`
      events appear in search or listings.

## 4. RSVP

### 4.1 Data model

```
EventRSVP
  id           uuid, pk
  event_id     uuid, fk -> Event
  user_id      uuid, fk -> User
  status       enum: going | interested | not_going
  created_at   timestamp
  -- unique (event_id, user_id)
```

### 4.2 Attendee list visibility

Governed by `Event.attendee_list_visibility` (§3.1) — deliberately made
configurable per event rather than picking one hardcoded default, since real
products vary here (a public meetup often shows "who's going" as social
proof; a sensitive gathering may not want that at all). This is a one-field
decision, cheap to make configurable, so there's no reason to force a single
platform-wide default the way, say, Phase 2's public-by-default follower
lists (§3.4 of that spec) were a deliberate one-size default for a much more
homogeneous feature.

### 4.3 Capacity is a hard cap, not a waitlist

`Event.capacity`, once reached, rejects further `going` RSVPs (an `interested`
RSVP is still allowed past capacity, since it isn't a commitment to attend).
There is no waitlist queue in Phase 8 — the roadmap asks for "RSVP," not
"RSVP with a waitlist," and a queue that auto-promotes on cancellation is a
real feature with its own edge cases (notification timing, fairness, ordering
under concurrent cancellations) that isn't asked for here. Flagged as a
plausible fast-follow in §11, not built speculatively now.

### 4.4 Acceptance criteria

- [ ] A `going` RSVP past `capacity` is rejected with a clear error, not
      silently accepted or silently dropped.
- [ ] `attendee_list_visibility = host_only` hides the RSVP list from
      everyone except the host and `created_by` user, including other
      attendees.

## 5. Ticketing

### 5.1 Reusing Phase 5's payment backbone, not building a second one

Ticket purchases are money-moving in exactly the shape Phase 5 designed
around: `PaymentTransaction` (Phase 5 §3.1) gains one more `kind` value,
`ticket_purchase`, rather than getting its own parallel ledger. This is the
payoff of that backbone being built as shared infrastructure in the first
place — Phase 8 is the first real test of whether it generalizes past its
original phase, and it does, with one extension (§5.2).

```
TicketType
  id               uuid, pk
  event_id         uuid, fk -> Event
  name             string, 1-80 chars  -- e.g. "General Admission", "VIP"
  price            decimal, nullable  -- nullable = a free ticket tier
  currency         string, nullable
  quantity_total   integer, nullable  -- nullable = unlimited
  quantity_sold    integer, default 0  -- denormalized, same pattern used throughout
  sales_start_at   timestamp, nullable
  sales_end_at     timestamp, nullable

Ticket
  id                       uuid, pk
  ticket_type_id           uuid, fk -> TicketType
  owner_id                 uuid, fk -> User
  payment_transaction_id   uuid, fk -> PaymentTransaction, nullable  -- null for a free ticket
  status                   enum: valid | cancelled | checked_in
  qr_code_token            string, unique  -- opaque, unguessable access-control credential — distinct in kind from Phase 1's profile QR code (§3.4 of that spec), which just encodes a public URL and carries no access-control weight; this one does, and must not be predictable
  checked_in_at            timestamp, nullable
  created_at               timestamp
```

### 5.2 Extending payout accounts to businesses, not communities

`CreatorPayoutAccount` (Phase 5 §3.1) was scoped to `user_id` only, because
Phase 5 was about individual creators. Business-hosted paid events need a
business to receive payout too, so this phase adds:

```
CreatorPayoutAccount:
  user_id      -> made nullable
  business_id  uuid, fk -> Business, nullable
  -- exactly one of user_id/business_id set — a two-way owner XOR, the same idiom already used for Link (Phase 4 §3.2), not the three-way pattern used for WikiPage/Event hosting, because payout accounts only need two owner kinds so far
```

**Community-hosted events do not get paid ticketing in Phase 8** —
communities have no monetization concept anywhere in this system yet (Phase
3 never built one), and inventing a "community treasury" payout concept
solely to support event ticket sales is scope creep this spec should name
and reject rather than build quietly. Community-hosted events are
RSVP-only; flagged as an open question in §11 if community monetization is
wanted later, not decided here.

### 5.3 Check-in is ticketed-events-only for now

`Ticket.qr_code_token` + `checked_in_at` gives ticketed events a real at-door
check-in flow. Free RSVP-only events don't get an equivalent in this phase —
check-in there is a headcount nicety, not a fraud/resale-prevention need the
way ticket check-in is, so it's a lower-priority, easy-to-add-later
extension using the identical field shape, not core to this phase's launch.

### 5.4 Acceptance criteria

- [ ] Ticket purchases write a `ticket_purchase`-kind `PaymentTransaction`,
      reusing Phase 5's ledger exactly, no parallel table.
- [ ] A `CreatorPayoutAccount` has exactly one of `user_id`/`business_id` set.
- [ ] No paid `TicketType` (non-null `price`) can be created for an event
      hosted by a community.
- [ ] `qr_code_token` is never derivable or guessable from the ticket's other
      fields (owner, event, ticket type) — a real access-control credential,
      not an obscurity placeholder.

## 6. Livestreaming and recordings

### 6.1 Native streaming is optional, not a launch dependency

An event's virtual component can simply be `virtual_join_url` pointing at an
external tool — this requires none of Phase 8's real-time infrastructure and
is enough to ship RSVP/ticketing for virtual events on day one. Native
livestream/voice-room attachment (below) is additive polish for events that
want it, not a blocking dependency for basic launch — worth stating plainly
so this phase's real-time work isn't mistaken for gating everything else in
it.

### 6.2 Reusing Phase 5 and Phase 3's real-time infrastructure

Rather than a third real-time system, an event's native live session reuses
whichever of the two already exists, scoped to the event with an additive
column (the same `Post.community_id`-style idiom, not an owner-XOR, since the
live session already has one meaningful owner — whoever's actually
broadcasting — and the event is a *context* it happens within, not a
competing owner):

```
Livestream (Phase 5) gains:
  event_id   uuid, fk -> Event, nullable

VoiceRoom (Phase 3) gains:
  event_id   uuid, fk -> Event, nullable
```

An event has at most one native live session attached (either a `Livestream`
or a `VoiceRoom` referencing it, not both) — enforced at the application
layer, since it's a cross-table constraint.

### 6.3 Recording: resolving two deferrals, with a new legal caveat

```
Livestream gains:
  is_recorded               boolean, default false
  recording_url              string, nullable  -- populated after the stream ends
  recording_retention_days    integer, nullable  -- optional auto-deletion after N days

VoiceRoom gains the identical three fields.
```

This directly resolves both flagged deferrals (Phase 5 §8.2's Livestream VOD
question and Phase 3 §12.2's VoiceRoom no-recording decision). It also
surfaces something neither earlier spec needed to address because neither
built recording: **recording a live audio/video session triggers
consent laws that vary by jurisdiction** (many US states and several
countries require all-party consent to record a conversation, not just
one-party). This is a genuine legal exposure, not a UX nicety, and belongs in
the same category of explicitly-flagged legal concerns already raised
elsewhere in this series (Phase 4's business-impersonation gate, Phase 5's
PCI/KYC delegation, Phase 5's CAN-SPAM newsletter requirement). Concretely:
`is_recorded` must be disclosed to all participants before or at the start of
the session, not merely toggled by the host with no visible indication to
attendees — exact compliance mechanics need legal review (§11), not an
engineering default invented here.

### 6.4 Acceptance criteria

- [ ] An event has at most one of a `Livestream` or `VoiceRoom` with a
      matching `event_id` — never both simultaneously.
- [ ] `is_recorded = true` produces a visible, unmissable indicator to every
      participant before or at session start — this is a hard requirement,
      not a nice-to-have, given the legal exposure in §6.3.
- [ ] `recording_url` is only populated after the session ends, and only if
      `is_recorded` was true for that session.

## 7. Superseding Phase 3's CommunityEvent

### 7.1 Migration plan

`CommunityEvent` (Phase 3 §7.3) was explicitly a placeholder, with a standing
note to revisit whether it should be superseded once this phase existed. It
is:

1. For every existing `CommunityEvent` row, create an `Event` row with
   `hosted_by_community_id` set to that community, `format` derived from
   whether `location` looks like a physical address versus a URL/blank (a
   heuristic — imperfect by nature, so community owners should be prompted
   to confirm/correct the migrated `format` rather than trust the guess
   silently), no `TicketType` rows (RSVP-only, matching what `CommunityEvent`
   already offered), and no native live session attached (owners can add one
   post-migration if wanted).
2. Any UI reading `CommunityEvent` is repointed at `Event` filtered by
   `hosted_by_community_id`.
3. The `CommunityEvent` table is dropped once the migration and repoint are
   verified complete — it does not remain as a second, parallel concept
   indefinitely, which is exactly the outcome Phase 3 flagged as a risk to
   avoid.

### 7.2 Acceptance criteria

- [ ] Every pre-existing `CommunityEvent` has a corresponding migrated
      `Event` with no data loss (title, description, timing, creator all
      preserved).
- [ ] `CommunityEvent` is fully retired (table dropped, no remaining code
      path reads or writes it) after migration — not kept around "just in
      case" alongside the new system.

## 8. Reactions, comments, and notifications

### 8.1 Reusing Phase 7's generalized primitive

`Event` is added to `Reaction`/`Comment`'s `subject_type` enum (Phase 7 §4.1)
— this is the first phase to actually reuse that generalization since it was
introduced, which is the point of having generalized it: a new content type
gets engagement for free, with no bespoke table and no repeat of the
Phase 4/Phase 6 pattern.

### 8.2 New notification types

Unlike ordinary content activity, event lifecycle events aren't like/comment
-shaped, so — consistent with how Phase 4 added genuinely new types for
reviews/jobs/appointments rather than force-fitting existing ones — this
phase adds:
- `event_reminder` — fires some time before `starts_at` (requires a
  scheduled-job mechanism; an infra concern, not specified further here).
- `event_cancelled` — fires to every `EventRSVP`/`Ticket` holder when
  `status` transitions to `cancelled`.
- `ticket_purchased` — a receipt-style confirmation to the buyer.

`Notification.subject_type` gains `event`.

### 8.3 Revisiting Phase 2's push/email deferral for this specific case

Phase 2 deferred all push/email notification delivery, in-app only (§4.3 of
that spec). `event_cancelled` and `ticket_purchased` are strong candidates
for at least email delivery regardless of that general deferral — someone
may have booked travel around an event that's now cancelled, and an in-app
notification they might not see in time isn't sufficient. This is flagged as
an open question (§11) worth deciding specifically for these two event
types, not as a reason to reopen the general push/email deferral everywhere
else.

### 8.4 Acceptance criteria

- [ ] Liking or commenting on an event uses the shared `Reaction`/`Comment`
      tables with `subject_type = event`, not a new bespoke table.
- [ ] `event_cancelled` fires to every current RSVP and ticket holder, not
      only ticket holders — free attendees deserve the same notice.

## 9. Search integration

### 9.1 A deliberate ranking exception

Every previous search integration in this series (Phase 1 §6.3, Phase 3 §16,
Phase 4 §14, Phase 6 §10, Phase 7 §8) ranks an exact/fuzzy title match,
tie-broken by engagement or recency. Events should not follow that recipe
mechanically: the operative question for event search isn't "which matching
event is most popular," it's "which matching event can I still attend."
Ranking for the new Events search tab is therefore: exact/fuzzy title match
first (consistent with every other entity), but tie-broken by **soonest
`starts_at`**, not engagement or recency — a deliberate, reasoned departure
from the established pattern, not an inconsistency.

Past events remain findable (e.g. to reach a recording) but are excluded from
the default "upcoming" view — presented behind an explicit Upcoming/Past
filter rather than blended into one chronologically-confusing ranked list.

### 9.2 Acceptance criteria

- [ ] Default event search results exclude events whose `ends_at` (or
      `starts_at` if `ends_at` is null) has already passed.
- [ ] Among matching upcoming events, soonest `starts_at` wins ties over any
      engagement signal.
- [ ] Community-hosted events with `attendee_list_visibility = host_only` do
      not leak attendee information via search result previews or metadata.

## 10. Cross-cutting concerns

### 10.1 Security

- No raw payment card data (§5.1) — same non-negotiable boundary since
  Phase 5 §3.5, exercised again here.
- `qr_code_token` is a genuine access-control credential (§5.1), not an
  obscurity placeholder — generated with sufficient entropy, never derivable
  from other ticket fields.
- Recording disclosure (§6.3) is enforced as a visible UX requirement, not
  left to the host's discretion to mention or not.
- RSVP/ticket-purchase/comment endpoints rate-limited, standing requirement
  since Phase 1 §7.2.

### 10.2 Privacy

- `Event.attendee_list_visibility` (§4.2) governs who sees the attendee
  list; default should be confirmed with product rather than assumed
  (flagged in §11).
- Recording retention (`recording_retention_days`) allows auto-deletion;
  exact default/legal minimum needs the same legal review as consent
  disclosure (§6.3).
- Event listing, RSVP/ticketing, and livestream-player UI meet the
  accessibility standing requirement from Phase 1 §7.3 — not restated in
  full per phase from here on.

## 11. Explicit open questions for product/legal sign-off

- **Recording consent/disclosure mechanics** (§6.3): exact UX requirement and
  jurisdictional compliance approach needs legal review — this is not
  optional to resolve before launch, unlike most open questions in this
  series which are genuinely deferrable.
- **Recording retention default** (§10.2): how long is a recording kept
  before auto-deletion, if `recording_retention_days` is unset?
- **Default `attendee_list_visibility`** (§4.2): public, attendees-only, or
  host-only as the out-of-the-box default when a host doesn't choose?
- **Waitlisting** (§4.3): confirmed out of scope for this phase, or does
  launch actually need it given how common capacity-capped meetups are?
- **Community-hosted paid ticketing** (§5.2): confirmed RSVP-only for
  communities in this phase, or does community monetization need to be
  introduced to unblock it?
- **Push/email for `event_cancelled`/`ticket_purchased`** (§8.3): worth
  breaking Phase 2's general in-app-only deferral for these two specific,
  time-sensitive notification types?
- **Free-RSVP check-in** (§5.3): needed at launch, or acceptable to ship
  ticketed-only check-in first?

## 12. Suggested build sequence within Phase 8

1. `Event` + three-way host XOR + slug reservation (reuses the established
   pattern) + `draft`/`published`/`cancelled` status (§3) — the anchor
   entity.
2. `EventRSVP` + hard capacity cap, no waitlist (§4) — the free path, usable
   standalone with `virtual_join_url` or an in-person `location`, no
   dependency on ticketing or native streaming.
3. `CommunityEvent` → `Event` migration and table retirement (§7) — sequence
   early, not as an afterthought, since Phase 3 explicitly flagged this as
   something not to leave unresolved.
4. `Reaction`/`Comment` extended to `subject_type = event` +
   `Notification.subject_type = event` (§8.1) — reuses Phase 7's primitive
   directly, minimal new work.
5. `CreatorPayoutAccount.business_id` extension (§5.2) + `TicketType`/
   `Ticket` + `PaymentTransaction.kind = ticket_purchase` + check-in (§5) —
   depends on step 1; the biggest chunk of new logic in this phase.
6. `event_reminder`/`event_cancelled`/`ticket_purchased` notification
   producers (§8.2) — `event_reminder` needs a scheduled-job mechanism, worth
   sequencing after the simpler two.
7. `Livestream.event_id`/`VoiceRoom.event_id` scope columns + recording
   fields (§6) — sequence after the recording-consent legal question (§11)
   is answered, given the compliance exposure; this is optional polish per
   §6.1, not a step 1–5 blocker.
8. Search integration with the soonest-first ranking exception (§9) —
   depends on step 1 existing, naturally lands last.
