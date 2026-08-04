# Phase 8 — Events: build plan (saved for later)

> Companion to the actual spec at
> [phase-8-events.md](phase-8-events.md); this is the implementation plan,
> not the spec itself. This session builds the full suggested build sequence
> (§12 steps 1–8) in one pass — smaller in absolute scope than Phase 7 turned
> out to be (one anchor entity, not four), so it doesn't need the same
> multi-session split.

## Pre-build finding: §7's migration has nothing to migrate

Spec §7 assumes a pre-existing `CommunityEvent` table (Phase 3 §7.3) to
migrate off. It was never built in this codebase — Phase 3 shipped without
it (grep of `prisma/schema.prisma` confirms no such model). §7 is therefore
a no-op here: no migration script, no table to drop, nothing to repoint.
`Event.hostedByCommunityId` is simply available from day one for community
hosts to use going forward.

## 1. `Event` (spec §3)

Third-way owner XOR, same idiom as `WikiPage` (Phase 7 §5.1) and now named
explicitly by the spec itself (§3.2) as the second instance of it.
`format`/`status`/`attendee_list_visibility` are plain strings, this
schema's standing convention (no Prisma enums anywhere in it). Global
`slug` (`@@unique`, not owner-scoped) — matches `0dot.in/e/slug` being a
flat namespace like `/c/`, `/b/`, `/p/`, not a per-owner path like
`/@user/articles/slug`. Sixth reuse of `validateSlugFormat`
(`src/lib/reserved-event-slugs.ts`), after usernames/communities/
businesses/projects/articles.

## 2. `EventRSVP` (spec §4)

Hard capacity cap on `going` only, `interested` uncapped, per §4.3 — checked
transactionally against a live count of `going` RSVPs + non-cancelled
`Ticket`s (capacity is defined as "total attendees, RSVP + tickets
combined," §3.1) at write time, not a denormalized counter, since the two
sources (RSVP and Ticket) would otherwise need two coordinated increments
with no single natural transaction boundary before ticketing (step 5)
exists yet.

## 3. `CommunityEvent` migration — skipped, see above

## 4. `Reaction`/`Comment` + `Notification.subjectType = event`

Adds `event` to `SUBJECT_RESOLVERS` (`src/app/actions/reactions.ts`).
`ownerId` for the resolver is always `Event.createdBy` — spec §3.1 already
names this field's purpose as "kept distinct from the host... for audit,"
which doubles as exactly the single resolvable accountable individual the
resolver pattern needs, so unlike `WikiPage`'s community-owned case (`ownerId:
null`, no fan-out target), an `Event` never hits the no-owner branch
regardless of host type.

## 5. Ticketing (spec §5)

**`PaymentTransaction.payeeId` extension, a judgment call beyond the spec's
literal text.** Spec §5.2 extends `CreatorPayoutAccount` with a nullable
`businessId` so a business can receive event payout, but doesn't mention
`PaymentTransaction` itself. `PaymentTransaction.payeeId` is a required
`User` FK — a business-hosted paid ticket has no `User` to point it at.
Rather than force a business's ticket revenue through some individual
staff member's personal ledger row (wrong "who got paid" story, and
disconnected from the very `businessId` payout account §5.2 just added),
`payeeId` becomes nullable and gains a sibling `payeeBusinessId`, exactly
the two-way owner XOR idiom the spec itself invokes repeatedly for this
exact shape (`Link` Phase 4 §3.2, `CreatorPayoutAccount` itself). This is
additive only — every existing `payeeId`-only call site (tips, digital
purchases, courses, affiliate commissions) is untouched.

`recordPaymentTransaction` (`src/lib/payments.ts`) gains an optional
`payeeBusinessId` alongside the existing `payeeId`, mutually exclusive,
enforced at the call site (`purchaseTicket` in `src/app/actions/events.ts`),
not the DB (no partial-index/CHECK support in this Prisma+SQLite setup,
same standing limitation `Link`/`ProjectCollaborator` already work around).

`qr_code_token`: `crypto.randomBytes(24).toString("base64url")` — genuine
entropy, never derived from ticket/owner/event ids (§5.1's explicit
requirement, §10.1 restates it).

Community-hosted events: `createTicketType` rejects non-null `price` when
`Event.hostedByCommunityId` is set (§5.2's explicit constraint, §5.4
acceptance criterion).

## 6. Notification producers (spec §8.2)

`event_reminder`, `event_cancelled`, `ticket_purchased` added to
`Notification.type`. `event_cancelled` fans out to every `EventRSVP` (status
`going`/`interested`) and every non-cancelled `Ticket` holder on the
`published→cancelled` transition (§8.4's literal acceptance criterion: not
ticket-holders-only). `ticket_purchased` fires inline from `purchaseTicket`.
`event_reminder` is schema/type-ready with no producer wired — same
placement `notifyCommunityInvite` already occupies in this codebase (Phase
3 §15: schema ready, "inviting isn't part of this build sequence") — since
it needs a scheduled-job mechanism this spec itself calls "an infra concern,
not specified further here" (§8.2). Not built speculatively.

Push/email for `event_cancelled`/`ticket_purchased` (§8.3's open question):
left in-app-only, consistent with Phase 2's standing deferral — flagged
open question, not resolved by this build.

## 7. Livestream/VoiceRoom scope + recording (spec §6)

Sequenced last among the schema work per the spec's own §12 step 7
ordering ("optional polish... not a step 1–5 blocker"), and built as
schema-only in this pass: `Livestream.eventId`/`VoiceRoom.eventId` +
`isRecorded`/`recordingUrl`/`recordingRetentionDays` on both. The
"at-most-one native session per event" cross-table constraint (§6.4) is
enforced in `attachLivestreamToEvent`/`attachVoiceRoomToEvent`
(`src/app/actions/events.ts`), not the DB. The recording-consent UX
requirement (§6.3/§11: visible disclosure before/at session start) is a
product/legal call this build doesn't invent an engineering default for —
flagged, not silently skipped.

## 8. Search integration (spec §9)

New `events` tab in `src/app/search/page.tsx`. Deliberate ranking
exception per §9.1: fuzzy title match first, tie-broken by soonest
`startsAt` (not engagement/recency, the pattern every other tab in this
file uses). Default view excludes events whose `endsAt` (or `startsAt` if
`endsAt` is null) has passed; an explicit Upcoming/Past toggle reveals the
rest. `hostOnly`-visibility attendee data is never selected into the search
query at all (§9.2) — not filtered post-query, absent from the `select`
clause entirely.

## Routes

`/e` (browse, upcoming by default), `/e/new` (create — host selector: self /
a business I manage / a community I moderate, mirroring `/b/new`'s form
shape), `/e/[slug]` (detail: RSVP, ticket purchase, engagement, host
controls inline for the creator/host). No separate `/e/[slug]/edit` or
manage-attendees route this pass — edit and attendee-list controls are
inline on the detail page behind an `isHost` check, same posture
`WikiPageForm`/`ArticleForm` edit-inline-on-own-page convention already
uses elsewhere in this codebase, kept consistent rather than introducing a
new per-entity management-page pattern this phase doesn't need.
