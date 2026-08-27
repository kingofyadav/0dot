# Phase 4 — Business Platform Spec

Status: Built. This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table and `../../README.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md)

## 1. Purpose & Scope

Phase 4 introduces `0dot.in/b/business` — a page that represents a company
rather than a person or a community. This phase also resolves a question both
Phase 1 and Phase 3 deliberately deferred: whether `Post` authorship needs to
become polymorphic. Communities didn't need it (members post *into* a
community, per Phase 3 §7.1); businesses do, because a business needs to post
*as itself* (§5).

**In scope:** Business identity, team/permissions, business-authored posts,
company page/contact info, products & services, a storefront listing,
job postings, appointments, reviews, documents.
**Out of scope:** Real payment/checkout processing (explicitly deferred, see
§8.2 — this is the single biggest scope-boundary decision in this phase),
the full Marketplace/commission engine (Phase 9), the standalone job board as
a cross-business product (Future Modules list — this phase only does
business-owned job postings, see §9.3), platform-wide Trust & Safety tooling
(Phase 12).

## 2. Success Criteria

- A business can be created, its identity claimed by an accountable owner, and
  made discoverable via search and `0dot.in/b/slug`, without any path that lets
  someone impersonate a real company without a review step (see §3.3 — this is
  treated as a launch-blocking requirement, not a nice-to-have).
- A team member with the right permission can post, respond to reviews, or
  manage the catalog *as the business*, with the acting individual still
  attributable in an audit trail.
- Products/services, jobs, and appointments are browsable and actionable end to
  end (view a product, apply to a job, request an appointment) without any of
  them silently requiring a payment feature that doesn't exist yet.

## 3. Business identity & structure

### 3.1 Data model

```
Business
  id                 uuid, pk
  slug               string, unique, citext, 3-40 chars  -- 0dot.in/b/slug
  name               string, 1-100 chars
  tagline            string, 0-140 chars
  description        string, 0-2000 chars
  logo_url           string, nullable
  cover_url          string, nullable
  category            string  -- from a curated taxonomy, same reasoning as Phase 3 discovery tags (§6 of that spec) rather than free text
  founded_year        integer, nullable
  size_range          enum: solo | 2_10 | 11_50 | 51_200 | 201_1000 | 1000_plus, nullable
  is_verified         boolean, default false  -- see §3.3, distinct meaning from Phase 1's creator verification
  created_by          uuid, fk -> User
  created_at          timestamp
  updated_at          timestamp

BusinessLocation
  id             uuid, pk
  business_id    uuid, fk -> Business
  label          string  -- e.g. "HQ", "Downtown branch"
  address        string
  latitude        decimal, nullable
  longitude       decimal, nullable
  hours           jsonb  -- {day: [{opens, closes}]}, empty = not listed, not "closed"

ContactInfo
  business_id    uuid, fk -> Business, unique
  email          string, nullable
  phone          string, nullable
  website        string, nullable
```

Slug validation and reservation reuse the exact single-source-of-truth
reserved-word/character policy established in Phase 1 §3.2 and reused again in
Phase 3 §3.2 — this is now the third namespace (`@user`, `/c/community`,
`/b/business`) sharing one validation function rather than three subtly
different ones.

### 3.2 Business links

Rather than inventing a separate "business links" entity, `Link` (Phase 1
§4.1) gains a nullable `business_id` alongside its existing `profile_id`, with
an XOR constraint (exactly one owner set). This gives businesses the same
drag-and-drop link list, click analytics, and scheduling behavior Phase 1
already built, for free — the same reuse-over-reinvent choice Phase 3 made
when it extended `Post` with `community_id` instead of building a parallel
content type.

### 3.3 Claiming and verification — a launch-blocking requirement, not a polish item

Unlike a personal `@username` (where impersonation risk is bounded — claiming
`@johnsmith` doesn't carry legal weight) or a community (a hobbyist space),
a business page represents a real legal entity, and self-serve creation with
zero verification creates a direct impersonation/trademark risk the moment a
bad actor creates `0dot.in/b/coca-cola`. This connects directly to the
roadmap's own Phase 13 commitment to "trademark protection for the 0dot.in
brand" and general IP compliance — the same posture needs to extend to
businesses using the platform, not just 0dot.in's own brand.

Recommended minimum bar for Phase 4 launch (flagged in §14 as needing explicit
product/legal sign-off on the exact mechanism, but **not** optional that some
mechanism exists):
- Business creation requires at least one weak signal beyond "anyone can type
  a name" — e.g. a work-email domain check against a claimed website, or a
  manual review queue before the page goes live/searchable.
- `is_verified` (a stronger, manually-granted checkmark, same pattern as
  Phase 1 profile verification) is separate from and additional to the
  baseline creation gate above — a business page can exist unverified, but
  should not be creatable with zero friction at all.
- A name-collision/likely-impersonation heuristic (fuzzy match against
  well-known brand names) should route to manual review rather than
  auto-publish — exact detection strategy is a Trust & Safety-adjacent
  build item, but the *decision to gate* is being made now, not deferred.

### 3.4 Acceptance criteria

- [ ] Business slug validation/reservation shares the identical reserved-word
      source used by usernames and community slugs.
- [ ] No business page can go live/searchable without passing whatever minimum
      claim/review gate is decided in §3.3 — this must be a hard requirement
      in the launch checklist, not something that ships and gets "added later."
- [ ] `Link` rows enforce exactly one of `profile_id`/`business_id` set, never
      both, never neither.

## 4. Team & permissions

### 4.1 Data model

```
BusinessMember
  business_id    uuid, fk -> Business
  user_id        uuid, fk -> User
  role           enum: owner | admin | editor | member
  title          string, nullable  -- public-facing job title, e.g. "Head of Support"
  is_public       boolean, default false  -- controls listing on the public Team tab
  joined_at      timestamp
  primary key (business_id, user_id)
```

- `owner`: full control, including deleting the business and transferring
  ownership.
- `admin`: manage team, catalog, jobs, appointments, respond to reviews, post
  as the business.
- `editor`: manage catalog/posts/jobs but cannot manage team membership or
  billing-adjacent settings.
- `member`: internal-only association (e.g. "I work here," useful for
  `is_public` team listing) with no write permissions.

The public "Team" tab on a business page shows only `BusinessMember` rows with
`is_public = true` — deliberately separate from the internal permission list,
the same way Phase 3 distinguished internal `CommunityMember` roles from any
future public-facing member display (§4 of that spec doesn't currently expose
one, but the same design instinct applies here: internal permission state and
public presentation are different concerns and shouldn't be forced into one
flag).

### 4.2 Acceptance criteria

- [ ] A `member`-role team entry cannot perform any write action against the
      business, even if `is_public` is true (public listing and permission
      level are independent).
- [ ] Removing the last `owner` is prevented or explicitly handled, matching
      the same requirement Phase 3 §4.2 stated for communities.

## 5. Posting as a business

This resolves the authorship question flagged and deferred in both Phase 1
(§7.1) and Phase 3 (§7.1 — "that question remains open only for Phase 4
business pages, which do need to post *as* the business").

```
Post gains:
  business_author_id   uuid, fk -> Business, nullable
```

- `Post.author_id` (the individual `User`) is **always** populated, even for a
  business post — it records which team member performed the action, for
  accountability, the same audit instinct behind Phase 3's `ModAction` log
  (§13 of that spec).
- When `business_author_id` is set, the post displays with the business's
  name/logo as the visible author instead of the individual — the human
  identity is retained for audit purposes but not surfaced in the UI.
- Only `BusinessMember` rows with `role` in `{owner, admin, editor}` may set
  `business_author_id` when creating a post, enforced server-side.
- This was deliberately **not** solved with a fully polymorphic
  `author_type + author_id` pair (which would force every existing
  `Post.author_id` join in Phase 1–3 code to become type-aware). Adding one
  nullable, additive column keeps every existing query correct by default and
  only requires new code to check the new column — lower migration risk for
  the same outcome.

### 5.1 Acceptance criteria

- [ ] A post with `business_author_id` set always has a valid, non-null
      `author_id` identifying the acting team member.
- [ ] A `member`-role (non-posting) team association cannot author a business
      post, enforced server-side, not just hidden in the composer UI.
- [ ] Existing Phase 1–3 queries that read `Post.author_id` continue to
      function unmodified; `business_author_id` is purely additive.

## 6. Company page

The public page at `0dot.in/b/slug` renders, in order: cover, logo, name,
tagline, verified badge (if `is_verified`), category, description, locations
& hours (§3.1), links (§3.2), then tabs for Products/Services (§7), Store
(§8), Jobs (§9), Team (§4), Reviews (§11), and a business post feed (same
per-community feed mechanics from Phase 3 §7.2, scoped to
`business_author_id` instead of `community_id`).

### 6.1 Contact

```
ContactMessage
  id             uuid, pk
  business_id    uuid, fk -> Business
  sender_user_id  uuid, fk -> User, nullable  -- null for a logged-out visitor submitting via name/email
  sender_name     string, nullable  -- required if sender_user_id is null
  sender_email    string, nullable  -- required if sender_user_id is null
  body            string, 1-2000 chars
  status          enum: new | read | archived
  created_at      timestamp
```

- A simple inbound contact form, visible to `admin`+ team members as a queue
  (status transitions, no reply-in-app in Phase 4 — replies happen over the
  email the sender provided; building in-app back-and-forth here would
  duplicate Phase 2 Messaging for a use case that doesn't need it yet).
- Rate-limited per sender (IP + email) to prevent spam submission, same
  posture as every other write endpoint flagged in prior phases.

### 6.2 Acceptance criteria

- [ ] A logged-out contact form submission requires both name and email; a
      logged-in submission does not need to re-collect them.
- [ ] Contact form submission is rate-limited per sender.

## 7. Products & Services

### 7.1 Unified offering model

Products and Services share most fields (name, description, price, images,
category); the meaningful difference is that services are often bookable
(§10) and don't ship, while products may have stock/inventory. Rather than two
near-duplicate tables, Phase 4 uses one:

```
Offering
  id             uuid, pk
  business_id    uuid, fk -> Business
  kind           enum: product | service
  name           string, 1-120 chars
  description    string, 0-2000 chars
  images         jsonb[]  -- max 8, same media-attachment shape as Phase 1 post media
  price          decimal, nullable  -- nullable = "contact for pricing"
  currency       string, nullable  -- required if price is set
  status         enum: draft | active | archived
  -- product-only fields, null for kind = service:
  sku            string, nullable
  stock_status   enum: in_stock | out_of_stock | made_to_order, nullable
  -- service-only fields, null for kind = product:
  is_bookable    boolean, nullable  -- gates whether Appointments (§10) applies
  duration_minutes  integer, nullable
  created_at     timestamp
  updated_at     timestamp
```

Phase 4 inventory is a status enum, not a real quantity-tracked stock system
(no decrement-on-purchase, no low-stock alerts) — a genuine simplification
worth naming explicitly, since "Products" on the roadmap could imply full
inventory management. If real inventory tracking is wanted, treat it as a
scoped addition once Store (§8) has an actual transaction path, not before.

### 7.2 Acceptance criteria

- [ ] A `service` offering with `is_bookable = true` and no
      `duration_minutes` is rejected at write time (booking needs a duration
      to generate slots, §10).
- [ ] `price` and `currency` are both null or both set, never one without the
      other.

## 8. Store

### 8.1 What "Store" means in Phase 4

The roadmap lists "Store" here in Phase 4 *and* a full "Marketplace" in
Phase 9 with transaction fees as a stated revenue line. These must not become
two competing commerce engines. Phase 4's Store is a **storefront listing**
layered on top of `Offering` (§7) — a filterable, purchasable-looking catalog
view — not a checkout/payment system. This mirrors the exact reasoning Phase 3
used to keep `CommunityEvent` a bulletin board rather than a ticketing
platform ahead of Phase 8 (Phase 3 spec §7.3).

### 8.2 Payments are explicitly out of scope for Phase 4

This is the single highest-leverage scope decision in this spec and is called
out on its own rather than buried in a bullet list: **Phase 4 does not process
payments or store payment instrument data.** Reasons this is a boundary, not
an oversight:
- PCI-DSS scope for handling card data directly is a large compliance
  undertaking that doesn't belong bolted onto a business-profile feature.
- Phase 9 (Marketplace) already carries "transaction fees" as a named revenue
  model item in the roadmap — building real checkout twice (once loosely here,
  once properly in Phase 9) is the kind of duplicated-system risk this spec
  process exists to catch.

Recommended Phase 4 behavior instead: each `Offering` marked for sale gets a
"Buy" action that either (a) deep-links to an external payment link the
business supplies (Stripe Payment Links, PayPal.me, etc. — 0dot.in never
touches card data) or (b) falls back to the Contact flow (§6.1) with
"contact for pricing." No `Order`/`Transaction` table exists in Phase 4.

### 8.3 Acceptance criteria

- [ ] No endpoint or data model in Phase 4 accepts, stores, or transmits raw
      payment card data.
- [ ] Every purchasable `Offering` resolves to either an external payment link
      or the contact flow — there is no in-app checkout path to build against.

## 9. Jobs

### 9.1 Data model

```
Job
  id              uuid, pk
  business_id     uuid, fk -> Business
  title           string, 1-120 chars
  description     string, 1-5000 chars
  location        string, nullable
  is_remote       boolean, default false
  employment_type  enum: full_time | part_time | contract | internship
  salary_min      decimal, nullable
  salary_max      decimal, nullable
  status          enum: open | closed
  posted_at       timestamp
  closes_at       timestamp, nullable

JobApplication
  id             uuid, pk
  job_id         uuid, fk -> Job
  applicant_id   uuid, fk -> User
  cover_note     string, 0-3000 chars
  resume_url     string, nullable  -- pre-signed upload, same pipeline as Phase 1 media
  status         enum: submitted | reviewed | rejected | hired
  created_at     timestamp
```

### 9.2 Notifications

New producer: `job_application` fires to `admin`+ team members when a
`JobApplication` is created; a status change on the application notifies the
applicant (reusing the generic notification delivery mechanics from Phase 2
§4, just a new `type` value).

### 9.3 Explicitly not a cross-business job board

This phase gives each business a jobs *tab on its own page* — it does not
build the cross-business "Job board" listed separately in the roadmap's
Future Modules section (a searchable, all-businesses jobs marketplace). The
`Job` table here is intentionally shaped so that a future job-board feature
can query across all businesses' `Job` rows without a migration (no
business-specific fields leak into an otherwise-generic job model) — but no
cross-business jobs search/browse surface is built in Phase 4 itself.

### 9.4 Acceptance criteria

- [ ] A closed job (`status = closed` or past `closes_at`) rejects new
      applications server-side, not just hides the apply button.
- [ ] Only `admin`+ team members can view applicant details (`resume_url`,
      `cover_note`) — applicants can see only their own application status.

## 10. Appointments

### 10.1 Scope warning

Like Phase 3's voice rooms, a fully general scheduling system (recurring
availability, multi-staff double-booking prevention, timezone handling,
reminders, cancellation policies) is a meaningfully large sub-project on its
own. The MVP below is scoped deliberately narrow; treat "can we also support
X" requests (recurring bookings, paid deposits, calendar sync) as signals to
revisit scope, not as small additions.

### 10.2 Data model (MVP)

```
AvailabilityRule
  id                uuid, pk
  business_id       uuid, fk -> Business
  team_member_id    uuid, fk -> User, nullable  -- null = business-level availability, not per-staff
  day_of_week       integer  -- 0-6
  starts_at_local   time
  ends_at_local     time
  timezone          string  -- IANA tz name, stored explicitly rather than assumed from business location

Appointment
  id                uuid, pk
  business_id       uuid, fk -> Business
  offering_id       uuid, fk -> Offering, nullable  -- the bookable service, if applicable
  customer_id       uuid, fk -> User
  team_member_id    uuid, fk -> User, nullable  -- assigned staff, if applicable
  starts_at         timestamp
  ends_at           timestamp  -- derived from offering.duration_minutes at booking time
  status            enum: requested | confirmed | cancelled | completed | no_show
  notes             string, 0-1000 chars, nullable
  created_at        timestamp
```

- Slots are computed on read from `AvailabilityRule` minus existing
  non-cancelled `Appointment` rows in that window — no precomputed slot table,
  same "don't precompute what a query can answer" instinct as Phase 2's
  fan-out-on-read feed decision (§6.1 of that spec).
- Every booking starts as `requested`; the business must `confirm` — no
  auto-confirm in Phase 4, since there's no payment/deposit mechanism (§8.2)
  to make a no-show costly, and auto-confirming into a staff member's calendar
  without their action invites double-booking races.
- No payment/deposit collection at booking time, consistent with §8.2.
- Cancellation policy (how late a customer can cancel, whether the business
  can no-show a customer) is not enforced by the system in Phase 4 beyond the
  status enum existing — actual policy text lives on the business's page, not
  in code.

### 10.3 Acceptance criteria

- [ ] Two non-cancelled appointments for the same `team_member_id` cannot
      overlap in time — enforced at write time (transactional check), not
      just prevented in the UI.
- [ ] `ends_at` is always derived from the offering's `duration_minutes` at
      booking time, not client-supplied.
- [ ] A `requested` appointment does not block the slot for other customers
      until it's clear whether it should (product decision: does a pending
      request tentatively hold the slot, or is it first-confirmed-wins? —
      flagged in §14, since either answer is defensible but they behave very
      differently).

## 11. Reviews

### 11.1 Data model

```
Review
  id             uuid, pk
  business_id    uuid, fk -> Business
  author_id      uuid, fk -> User
  rating         integer, 1-5
  body           string, 0-2000 chars
  created_at     timestamp
  updated_at     timestamp

ReviewResponse
  review_id      uuid, fk -> Review, unique  -- one official response per review
  responder_id   uuid, fk -> User  -- must be a BusinessMember with admin+ role
  body           string, 1-2000 chars
  created_at     timestamp
```

- One review per `(business_id, author_id)` — editable, not stackable;
  prevents review-count inflation from the same person.
- `Business` gains a denormalized `average_rating` and `review_count`,
  recomputed transactionally on review create/update/delete, same
  denormalization pattern used throughout (Phase 1 link clicks, Phase 2 follow
  counts, Phase 3 member counts).
- A business can respond once per review but **cannot delete or hide a
  negative review** in Phase 4 — review integrity matters more than a
  business's comfort, and building a moderation/dispute path for reviews
  belongs with Phase 12 Trust & Safety (fake-review detection, dispute
  process), not invented ad hoc here.

### 11.2 Acceptance criteria

- [ ] A user cannot submit a second review for the same business; editing
      their existing one is the only path to change it.
- [ ] A business cannot delete or hide another user's review; only the
      review's own author can delete it.
- [ ] `average_rating`/`review_count` stay consistent with the underlying
      `Review` rows after create/update/delete, verified transactionally.

## 12. Documents

### 12.1 Data model

```
BusinessDocument
  id             uuid, pk
  business_id    uuid, fk -> Business
  title          string, 1-120 chars
  file_url       string  -- pre-signed upload, same pipeline as Phase 1 media
  visibility     enum: public | team_only
  uploaded_by    uuid, fk -> User
  created_at     timestamp
```

A simple file library (brochures, spec sheets, policies) — no versioning
(unlike Phase 3's wiki, §10 of that spec, which explicitly needed revision
history for collaborative editing; a re-uploaded document here is just a new
row, and the old one can be deleted, since these are typically
business-controlled static assets, not collaboratively edited content).

### 12.2 Acceptance criteria

- [ ] `team_only` documents are not returned by any public-facing API,
      including the business's own public page response.

## 13. Notifications: new producers

- `business_review` — fires to `admin`+ team members when a new `Review` is
  posted.
- `job_application` — see §9.2.
- `appointment_request` / `appointment_confirmed` / `appointment_cancelled` —
  fire to the relevant party (business team for a new request, customer for a
  confirmation/cancellation).
- Business posts (§5) reuse the existing `like`/`comment`/`mention` types from
  Phase 1/2 — no new type needed there, same reasoning Phase 3 §15 gave for
  not growing the notification enum for ordinary content activity.

## 14. Search integration

Resolves the second half of Phase 1's stubbed search tabs (§6.1 of that
spec noted both "communities" and "businesses" as present-but-empty;
Phase 3 filled in communities, this phase fills in businesses):

- Searchable by `name` and `category`, same Postgres full-text approach as
  users/posts/communities — no new search infrastructure needed at this scale.
- Ranking: exact slug/name match first, then category match, tie-broken by
  `is_verified` then `average_rating` — same exact-then-fuzzy-then-tiebreak
  shape established in Phase 1 §6.3 and reused in Phase 3 §16.
- An unverified, unreviewed business (per the §3.3 claim gate) should not rank
  ahead of verified/established ones purely by recency — worth confirming as
  explicit ranking intent rather than an accidental side effect of "newest
  first" creeping in anywhere.

## 15. Cross-cutting concerns

### 15.1 Security

- No payment card data anywhere in this phase's scope (§8.2) — the most
  important security boundary in this spec.
- Business post/catalog/job-application write endpoints are permission-checked
  server-side against `BusinessMember.role`, never inferred from UI state
  alone (same posture as every prior phase's server-side enforcement
  requirements).
- Document, review, and contact-message content is rendered as escaped
  text/sanitized markdown, same posture as every user-authored content field
  since Phase 1 §7.2.
- Rate limiting on contact form submission (§6.1), review submission, and job
  applications, consistent with the standing requirement from Phase 1 §7.2.

### 15.2 Privacy

- `ContactMessage` sender email/name for logged-out submitters is visible only
  to `admin`+ team members, never public.
- `JobApplication` resume/cover-note content is visible only to `admin`+ team
  members and the applicant themself.
- Review `author_id` is public (reviews are attributed, not anonymous) — worth
  stating explicitly since it's a deliberate integrity choice (anonymous
  reviews are far easier to fake), not an oversight.
- Business page, catalog, and appointment-booking UI meet the accessibility
  standing requirement from Phase 1 §7.3 — not restated in full per phase
  from here on.

## 16. Interactions with Phase 1–3

- `Link` (Phase 1) gains `business_id` — additive, no migration risk (§3.2).
- `Post` (Phase 1) gains `business_author_id` — additive, resolves the
  authorship question flagged in Phase 1 §7.1 and Phase 3 §7.1 (§5).
- Slug reservation/validation reuses the single shared source from Phase 1
  §3.2, already reused once in Phase 3 §3.2 — this is its second reuse, not a
  new policy.
- Search ranking philosophy (exact → fuzzy → tiebreak) and the search-tabs
  build-out both directly continue the pattern Phase 1 set up and Phase 3
  already followed once (§14).
- No changes required to any Phase 1–3 table beyond the two additive columns
  above.

## 17. Explicit open questions for product/legal sign-off

- **Business claim/verification mechanism (§3.3)**: exact gate (email-domain
  check, manual review queue, document upload) needs legal/product input —
  the requirement that *some* gate exists is not optional, but which one is.
- **Store payment approach (§8.2)**: confirm external-payment-link/
  contact-only is acceptable for Phase 4, versus pressure to bring some
  checkout forward from Phase 9 — recommend holding the line given the PCI
  and duplicated-system risk, but this is a real product-pressure point worth
  surfacing explicitly rather than assuming it won't come up.
- **Appointment hold behavior (§10.3)**: does a `requested` appointment
  tentatively hold the slot, or is it first-confirmed-wins?
- **Review dispute path**: is "no delete, one response" sufficient for launch,
  or does a business need any escalation path before Phase 12 Trust & Safety
  exists?
- **Inventory depth for Products (§7.1)**: confirm status-enum-only stock is
  acceptable, versus expectation of real quantity tracking.

## 18. Suggested build sequence within Phase 4

1. `Business` + slug reservation (reuses Phase 1/3 pattern) + `BusinessMember`
   with `owner` role only + the §3.3 claim/verification gate — the gate must
   ship with creation, not be bolted on after launch.
2. Team roles/permissions (§4) + `business_author_id` on `Post` (§5) — the
   core "this is a business, and it can act" loop.
3. Company page fields, `BusinessLocation`, `ContactInfo`, `ContactMessage`
   (§6) and `Link.business_id` reuse (§3.2).
4. `Offering` (§7) — products and services as a unified catalog.
5. Store surfacing of `Offering` with external-payment-link/contact-only
   purchase path (§8) — no `Order`/`Transaction` table, by design.
6. Reviews (§11) — independent of catalog/jobs, can be built in parallel with
   step 4–5.
7. Jobs + applications (§9) — independent vertical, can be parallelized with
   the above.
8. Appointments (§10) — sequence after `Offering` exists (bookable services
   depend on it) and after the §17 hold-behavior question is answered.
9. Documents (§12) — low-risk, no dependencies, safe to slot in anywhere.
10. Search integration and notification producers (§14, §13) — depend on the
    entities above existing, naturally land last.
