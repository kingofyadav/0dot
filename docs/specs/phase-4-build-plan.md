# Phase 4 — Business Platform: build plan (saved for later)

> Not started yet — saved so a future session can pick up Step 0 without
> re-deriving the design. Companion to the actual spec at
> [phase-4-business-platform.md](phase-4-business-platform.md); this is the
> implementation plan, not the spec itself.

## Context

Phase 4 (`docs/specs/phase-4-business-platform.md`) has zero code today — no `Business` table, no `/b/[slug]` routes, nothing. It's comparable in size to all of Phase 3 steps 4–10 combined, so this gets built the same way: one comprehensive plan, then section-by-section execution, each migrated/typechecked/linted/smoke-tested before the next.

The spec flags 5 open product/legal questions (§17) rather than picking answers itself. The user delegated those calls to me — decisions below, each stated plainly so they're easy to override later, not silently baked in.

## Decisions on the spec's open questions

1. **Claim/verification gate (§3.3, launch-blocking)**: this app has no platform-admin concept at all today. Building one is a real, small addition, not a hand-wave: `User` gains `isPlatformAdmin Boolean @default(false)` (manually granted via direct DB access — same "no self-serve flow" posture as `Profile.isVerified` already established in Phase 1). `Business.status` starts `pending`. A **weak-signal auto-approval** promotes straight to `active`: the creator's account email domain matches the business's own website domain (e.g. creating a business with `website: acme.com` while logged in as `you@acme.com`), or the creator already holds `Profile.isVerified`. Otherwise it stays `pending` — visible/editable only to its own team, not public/searchable — until a platform admin approves it from a minimal new review queue (`/admin/businesses`, `isPlatformAdmin`-gated). This is the actual bar the spec calls launch-blocking, not a placeholder.
2. **Store payment (§8.2)**: holding the spec's own recommendation exactly — external payment link or contact-fallback, no `Order`/`Transaction` table, no card data anywhere.
3. **Appointment hold behavior (§10.3)**: a `requested` appointment **does** tentatively hold the slot — the overlap check (§10.3's acceptance criterion) applies to every non-cancelled status, not just `confirmed`. Simpler to implement (one check, one code path) and avoids the confusing UX of two customers racing for the same slot.
4. **Review dispute path**: accepting the spec's own recommendation — "no delete, one official response" is sufficient for this phase.
5. **Inventory depth**: accepting the spec's own recommendation — status-enum stock only, no quantity tracking.

## 0. Slug validation — actually shared this time

The spec explicitly frames business slugs as "the third namespace... sharing one validation function" (§16), stronger than what Phase 3 did (a mirrored-shape-but-separate file for community slugs). Worth doing properly now that there's a third instance: extract `src/lib/slug-validation.ts` — `validateSlugFormat(raw, {minLength, maxLength, reservedWords}): "invalid_format" | "reserved" | null`, the shared regex/digit-only/reserved-word core. `reserved-usernames.ts` and `reserved-community-slugs.ts` become thin wrappers calling it with their own reserved-word `Set`s and length bounds (their exported function names/behavior/reserved lists are unchanged — this is a safe internal refactor, not a behavior change). New `src/lib/reserved-business-slugs.ts` follows the identical thin-wrapper shape for `/b/`.

*(This step was drafted and verified once already, then deliberately reverted at the user's request so the repo would have zero Phase 4 changes while this plan sits idle — safe to redo from scratch.)*

## 1. Business identity + claim gate + team

**Schema**: `Business` (per spec §3.1, plus `status`), `BusinessLocation` (`hoursJson String?` — a deliberate, scoped exception to this codebase's "discrete columns, not jsonb" convention: business hours are a genuinely variable nested structure — multiple ranges per day for lunch-break splits — that doesn't decompose into fixed columns the way `PostMedia` does; parsed/validated at the app layer, same posture `Offering.imagesJson` below will share), `ContactInfo`, `BusinessMember`. `User` gains `isPlatformAdmin`.

**`src/lib/businesses.ts`**: `getBusinessMember`, `isBusinessOwner`, `isBusinessStaff` (`owner|admin`), `canManageCatalog` (`owner|admin|editor`) — mirrors `communities.ts`'s exact shape (`getCommunityMember`/`isCommunityOwner`/`isCommunityStaff`).

**`src/app/actions/businesses.ts`**: `createBusiness` (slug via the new shared validator; runs the weak-signal check, sets `status`), `updateBusiness`, team actions (`inviteTeamMember` — adds a member row directly, no accept/decline flow, matching how this phase's spec doesn't ask for one; `updateTeamMemberRole`, `removeTeamMember`, `transferBusinessOwnership`, `leaveBusinessTeam`) — same permission-tier shape as `communities.ts`'s moderator actions (owner-only vs. staff-tier where the spec draws that line in §4.1).

**`/admin/businesses`** (new, `isPlatformAdmin`-gated): lists `pending` businesses, approve/reject actions.

**UI**: `/b/new`, `/b/[slug]` (identity header + tabs shell), `/b/[slug]/manage` (team + business details, mirrors `/c/[slug]/manage`'s shape).

## 2. Business posts (`business_author_id`)

**Schema**: `Post.businessAuthorId String?` (fk → `Business`, `onDelete: SetNull` — same reasoning as `Post.flairId`: losing the business shouldn't take the post with it). No polymorphic `author_type` — exactly the additive-column approach §5 specifies, so every existing `Post.authorId` query keeps working unmodified.

**`src/app/actions/posts.ts`**: `createPost` gains an optional `businessId`, validated against `canManageCatalog`-tier membership (owner/admin/editor — matches §5's "only owner/admin/editor may author" line) via a `resolveBusinessAuthorContext` helper in `businesses.ts`, mirroring `resolvePostCommunityContext`'s exact shape. `author_id` (the acting user) is always still set — the human stays attributable even when the business is the visible author.

**`PostCard.tsx`**: when `businessAuthorId` is set, the author line shows the business's name/logo instead of the user's — same optional/present-everywhere pattern already used for `community`/`flair`.

## 3. Company page fields + contact

**Schema**: `ContactMessage` (per spec §6.1).

**`src/app/actions/business-contact.ts`**: `sendContactMessage` (rate-limited per sender — IP for logged-out via `getClientIp`, user id for logged-in; requires name+email only when logged out, per §6.2's literal acceptance criterion), `markContactMessageRead`/`archiveContactMessage` (staff-tier).

**UI**: locations/hours/contact rendered on `/b/[slug]`; a contact form; an `admin`+-only inbox at `/b/[slug]/manage/contact`.

## 4. Offerings (products & services)

**Schema**: `Offering` (per spec §7.1, `imagesJson` following the same reasoning as `BusinessLocation.hoursJson`). Validates §7.2's two acceptance criteria at write time: `is_bookable` requires `duration_minutes`; `price`/`currency` are both-or-neither.

**`src/app/actions/offerings.ts`**: `createOffering`/`updateOffering`/`archiveOffering`, `canManageCatalog`-tier.

**UI**: `/b/[slug]/catalog` (grid, filter by kind), create/edit forms.

## 5. Store surfacing

No new table (§8.1/§8.2 — a storefront *view* over `Offering`, not a commerce engine). `/b/[slug]/store`: same catalog data as §4, styled as a shop grid; each purchasable `Offering` shows a "Buy" button that either opens the business's external payment-link field (new `Offering.paymentLinkUrl String?`, only meaningful when `price` is set) or falls back to the contact form when absent.

## 6. Reviews

**Schema**: `Review` (`@@unique([businessId, authorId])`), `ReviewResponse`. `Business` gains denormalized `averageRating`/`reviewCount`, recomputed transactionally in the same write, same pattern `Profile.followerCount`/`Community.memberCount` already established.

**`src/app/actions/reviews.ts`**: `createOrUpdateReview` (upsert on the unique constraint — "editable, not stackable" per spec, one action covers both create and edit), `deleteReview` (author-only), `respondToReview` (`admin`+-tier, one response per review enforced by the schema's own unique PK on `reviewId`).

## 7. Jobs + applications

**Schema**: `Job`, `JobApplication` (per spec §9.1).

**`src/app/actions/jobs.ts`**: `createJob`/`closeJob` (`canManageCatalog`-tier), `applyToJob` (any verified user; rejects if `status = closed` or past `closesAt`, per §9.4's literal criterion — checked server-side, not just hidden), `updateApplicationStatus` (`admin`+-tier only — `resumeUrl`/`coverNote` visibility gated the same way in the read path: applicant sees their own, `admin`+ sees all, per §15.2).

**Notifications**: extends `notifications.ts` with `job_application` (fires to `admin`+ on a new application — same "who gets notified" fan-out shape as `community_update`'s single/few-recipient producers, not a broadcast) and an application-status-change notification to the applicant, reusing the generic delivery mechanics per spec §9.2 (no new transport).

## 8. Appointments

**Schema**: `AvailabilityRule`, `Appointment` (per spec §10.2). `@@index([businessId, teamMemberId, startsAt])` for the overlap check.

**`src/lib/appointments.ts`**: `getAvailableSlots(businessId, offeringId, dateRange)` — computed on read from `AvailabilityRule` minus existing non-cancelled `Appointment`s in the window (§10.2's explicit "no precomputed slot table" instinct, same as Phase 2's fan-out-on-read feed).

**`src/app/actions/appointments.ts`**: `requestAppointment` (customer-facing; `endsAt` always derived server-side from `offering.durationMinutes`, never client-supplied, per §10.3's literal criterion; the overlap check — decision #3 above — runs inside the same transaction as the insert, so two simultaneous requests for the same slot can't both succeed), `confirmAppointment`/`cancelAppointment` (business staff), `cancelMyAppointment` (customer).

**Notifications**: `appointment_request` (to staff), `appointment_confirmed`/`appointment_cancelled` (to the customer).

## 9. Documents

**Schema**: `BusinessDocument` (per spec §12.1) — reuses `saveMessageAttachment(file, "file")` from `src/lib/uploads.ts` (already accepts PDF/image/text, same pipeline this spec calls for) rather than a third upload path; the same function also covers `JobApplication.resumeUrl` in step 7.

**`src/app/actions/business-documents.ts`**: `uploadDocument`/`deleteDocument` (`canManageCatalog`-tier). Read path filters `team_only` documents out of any response a non-team-member could reach — the literal §12.2 acceptance criterion, enforced in the query, not the UI.

## 10. Search + notification producers

**`src/app/search/page.tsx`**: replace the "coming with the Business Platform phase" stub with `searchBusinesses(q)` — mirrors `searchCommunities`'s exact rank-then-fetch shape (exact slug/name match, then category match, tie-broken by `isVerified` then `averageRating`, per §14) — and excludes `status != "active"` from results, so a pending/unreviewed business never appears in search regardless of ranking (closes §14's "shouldn't rank ahead of established ones" concern by construction, not just tie-break order).

**`notifications.ts`**: `business_review` producer added alongside the job/appointment ones already covered in steps 7–8. Business posts deliberately reuse the existing `like`/`comment`/`mention` types — no new type, per §13's explicit reasoning.

## Suggested execution order

Steps 0–2 first (shared slug validator, identity/claim/team, business posts) — everything else depends on a `Business` existing. 3–4 (contact, offerings) next, no dependencies on each other. 5 (store) depends on 4. 6–7 (reviews, jobs) are independent of each other and of 4–5, can go in either order. 8 (appointments) depends on 4 (offerings) and decision #3 above. 9 (documents) has no dependencies, can slot in anywhere. 10 (search + remaining notification producers) last, since it wires into everything above.

## Verification (per section, same rhythm as every prior phase)

- `npx prisma migrate dev`, `npx tsc --noEmit`, `npm run lint` clean after each section.
- Manual smoke test per section's user-facing flow via the dev server — e.g. for step 1: create a business with a non-matching email/website (confirm it lands `pending` and is invisible to `/search`), then with a matching domain (confirm instant `active`); for step 8: request overlapping appointments for the same staff member from two sessions, confirm the second is rejected at write time, not just in the UI.
