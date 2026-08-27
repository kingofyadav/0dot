# Phase 5 — Creator Platform Spec

Status: Built — payments backbone backed by live Stripe Connect (Accounts v2). This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table and `../../README.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md)

## 1. Purpose & Scope

Phase 5 lets individual creators earn money directly on 0dot.in: memberships,
paid subscriptions, digital downloads, tips, affiliate links, livestreams,
podcasts, newsletters, and online courses. Every one of these, except
newsletters, involves real money changing hands — this is the first phase
where that's true. Phase 4 was able to defer all payment processing to "later"
(its Store just links out to external payment pages, see Phase 4 spec §8.2);
that deferral doesn't work here — a $5 tip or a $10/month membership can't be
"contact for pricing." **The central decision in this spec is therefore not
any one feature, it's building one shared payments backbone that every feature
below sits on top of** (§3), rather than nine features each inventing their
own way to move money.

**In scope:** a shared payments/payout backbone, memberships & paid
subscriptions (unified), digital downloads, tips, affiliate links,
livestreams, podcasts, newsletters, online courses.
**Out of scope:** the cross-creator Marketplace browsing/discovery experience
and its commission model (Phase 9 — this phase builds the payment rails Phase
9 should reuse, not the storefront), in-house KYC/tax-form handling (delegated
to the payment processor, see §3.3), platform-wide Trust & Safety for
payment fraud (Phase 12).

## 2. Success Criteria

- A creator can go from "not monetized" to "receiving a tip" through one
  onboarding flow, with 0dot never touching or storing raw payment
  instrument data at any point (same non-negotiable boundary Phase 4 §15.1
  established for card data, now actually exercised rather than deferred).
- Every money-moving feature (tip, purchase, subscription charge, affiliate
  commission) produces one consistent, auditable ledger entry — a support
  agent or the creator themself can answer "where did this dollar come from"
  without needing feature-specific tooling per monetization type.
- Membership-gated content (posts, podcast episodes, course access,
  livestreams) uses one tier-gating mechanism, not four parallel ones.
- No feature in this phase silently duplicates what Phase 9's Marketplace is
  supposed to own — where overlap exists (digital downloads, see §5), it's
  named explicitly as shared infrastructure, not two systems.

## 3. The payments backbone

### 3.1 Why this is one subsystem, not nine

Tips, digital-product purchases, course purchases, membership charges, and
affiliate commissions are all "move money from one party to another, minus a
platform cut, via a real payment processor." Building each as its own
bespoke integration would mean nine slightly-different reconciliation
stories, nine places a bug in fee calculation could hide, and nine things
Phase 9 would have to choose between reusing or ignoring. Instead:

```
CreatorPayoutAccount
  id                    uuid, pk
  user_id               uuid, fk -> User, unique
  processor             enum: stripe_connect  -- named explicitly even with one value, so the abstraction is real, not aspirational
  processor_account_id  string  -- opaque external identifier
  status                enum: onboarding | active | restricted
  created_at            timestamp

PaymentTransaction
  id                   uuid, pk
  kind                 enum: tip | digital_purchase | course_purchase | membership_charge | affiliate_commission
  payer_id             uuid, fk -> User, nullable  -- null for e.g. a recurring charge initiated by the processor rather than an in-session user action
  payee_id             uuid, fk -> User  -- the creator, or the affiliate for a commission-kind row
  amount               decimal
  currency             string
  platform_fee         decimal
  processor_reference  string  -- external charge/invoice id, source of truth for reconciliation
  status               enum: pending | succeeded | failed | refunded
  related_object_type  enum: tip | digital_product | course | membership_tier | affiliate_link, nullable
  related_object_id    uuid, nullable
  created_at           timestamp
```

Every feature in §4–§11 that moves money writes to `PaymentTransaction`; none
of them get their own parallel transaction table. `platform_fee` is captured
per-row (not computed later from a global percentage) so a historical fee-rate
change never rewrites the story of a past transaction.

### 3.2 Platform fee

Ties directly to the roadmap's Revenue Model bullets ("Creator subscriptions,"
"Transaction fees") — this is where those line items actually get
implemented. The fee percentage itself is a product/finance decision (flagged
in §14, not invented here); the architectural point is that it's captured at
transaction time on every row, giving a complete historical record regardless
of future rate changes.

### 3.3 Identity verification and tax compliance are delegated, not built

A creator payout account requires KYC (identity verification) and, in most
jurisdictions, tax reporting (e.g. a US 1099 at year-end). **0dot does not
build this itself** — it's handled by the payment processor's own onboarding
flow (e.g. Stripe Connect's hosted onboarding), and `CreatorPayoutAccount`
only stores the resulting opaque account reference and status. Building
in-house identity verification or tax-form generation would be a large,
regulator-sensitive undertaking with no product upside over using what Stripe
(or an equivalent) already provides — explicitly out of scope, not a gap.

### 3.4 Refunds and disputes

Chargebacks and refund requests need a defined policy (who absorbs a
chargeback fee, whether a refunded membership month revokes already-consumed
access) — flagged in §14 as needing product/finance input rather than
assumed here. The schema supports it (`PaymentTransaction.status = refunded`)
without prescribing the policy.

### 3.5 Acceptance criteria

- [ ] No endpoint or table anywhere in this phase stores raw payment card
      data — every charge flows through the processor via its own hosted
      elements/checkout, same boundary as Phase 4 §8.2, now actually load-bearing.
- [ ] Every one of tip/digital_purchase/course_purchase/membership_charge/
      affiliate_commission produces exactly one `PaymentTransaction` row with
      a non-null `platform_fee` and `processor_reference`.
- [ ] A creator cannot receive a payout-requiring transaction (tip, purchase,
      subscription charge) until their `CreatorPayoutAccount.status = active`.

## 4. Memberships & paid subscriptions

The roadmap lists these as two bullets; they're one feature (recurring paid
access, optionally tiered) and are built as one.

### 4.1 Data model

```
MembershipTier
  id                uuid, pk
  creator_id        uuid, fk -> User
  name              string, 1-60 chars
  level             integer  -- ordering; a tier gates "this level or higher"
  price             decimal
  currency          string
  billing_interval  enum: monthly | yearly
  description       string, 0-1000 chars
  status            enum: active | archived

MembershipSubscription
  id                          uuid, pk
  tier_id                     uuid, fk -> MembershipTier
  fan_id                      uuid, fk -> User
  status                      enum: active | past_due | cancelled
  current_period_end          timestamp
  processor_subscription_id   string  -- external recurring-billing object, source of truth for renewal state
  created_at                  timestamp
```

Recurring billing state (renewal, retries on card decline, dunning) lives in
the payment processor, not reimplemented here — `status`/`current_period_end`
are a cache of what the processor reports via webhook, not independently
computed. This mirrors §3.3's delegation principle: don't rebuild what a
payment processor already does correctly.

### 4.2 Gating mechanism (reused across §5–§10)

```
Post gains:
  required_tier_id   uuid, fk -> MembershipTier, nullable
```

A viewer can see a gated post if they have an `active` `MembershipSubscription`
to that tier or any tier with a higher `level` from the same creator. The same
`required_tier_id`-style gate (adapted per entity) is reused for podcast
episodes (§9), course access (§11), and livestream access (§8) rather than
each feature inventing its own access-check logic — one gating rule, checked
consistently everywhere it's needed.

### 4.3 Acceptance criteria

- [ ] A fan subscribed to a lower-level tier cannot see content gated to a
      higher-level tier from the same creator.
- [ ] `MembershipSubscription.status` transitions are driven by processor
      webhooks, not client-reported state — a client cannot mark its own
      subscription active.
- [ ] Cancelling a subscription retains access through `current_period_end`,
      not immediately, matching standard subscription-billing expectations.

## 5. Digital downloads

### 5.1 This is very likely the same feature as Phase 9's "digital products"

The roadmap lists "Digital downloads" here in Phase 5 and "Digital products"
again under Phase 9's Marketplace. These should not become two systems.
Recommendation: build the real `DigitalProduct`/purchase implementation here,
scoped to a creator selling from their own profile; Phase 9 should later add
cross-creator *discovery/browsing* (a storefront that surfaces products from
many creators) on top of this same table, not a second product-and-purchase
model. Flagging this now, at spec-writing time, is cheaper than discovering
the duplication mid-build.

### 5.2 Data model

```
DigitalProduct
  id            uuid, pk
  creator_id    uuid, fk -> User
  title         string, 1-120 chars
  description   string, 0-2000 chars
  price         decimal
  currency      string
  files         jsonb[]  -- references to stored files, not public URLs (see §5.3)
  status        enum: draft | active | archived

DigitalProductPurchase
  id                       uuid, pk
  product_id               uuid, fk -> DigitalProduct
  buyer_id                 uuid, fk -> User
  payment_transaction_id   uuid, fk -> PaymentTransaction
  purchased_at             timestamp
```

### 5.3 Download delivery

Files are never served from a permanently public URL — a buyer requests a
download and the server issues a short-lived, signed URL after verifying a
`DigitalProductPurchase` row exists for that buyer/product pair. This is the
same pre-signed-URL pattern used throughout (Phase 1 post media, Phase 4
documents), applied here with an authorization check in front of it rather
than none.

### 5.4 Acceptance criteria

- [ ] A user without a `DigitalProductPurchase` row cannot obtain a valid
      download URL for that product, even by guessing/reusing another buyer's
      URL (URLs are short-lived and buyer-scoped).
- [ ] A refunded purchase (`PaymentTransaction.status = refunded`) revokes
      future download-URL issuance — access to already-downloaded files
      obviously can't be revoked, and that's a known, unavoidable limit of
      digital goods, not a gap in this spec.

## 6. Tips

### 6.1 Data model

```
Tip
  id                       uuid, pk
  from_user_id             uuid, fk -> User
  to_creator_id            uuid, fk -> User
  amount                   decimal
  currency                 string
  message                  string, 0-280 chars, nullable
  payment_transaction_id   uuid, fk -> PaymentTransaction
  created_at               timestamp
```

The simplest feature in this phase precisely because it's a thin wrapper
around §3's backbone — no subscription state, no access grant, just a
one-time charge and an optional public thank-you message.

### 6.2 Acceptance criteria

- [ ] A tip cannot be created without a corresponding successful
      `PaymentTransaction` — no "record the tip, charge later" path that could
      drift out of sync.

## 7. Affiliate links

### 7.1 Deliberately narrow scope

A full affiliate program (third parties earning commission promoting a
creator's paid offerings) is a real feature, but the version that pays
commission to *anyone, including non-0dot users* requires a payout mechanism
for people who may have no relationship to the platform yet — that's out of
proportion for this phase. Phase 5's affiliate links require the affiliate to
be a 0dot user who completes the **same** `CreatorPayoutAccount` onboarding
from §3 — one payout rail, reused, not a second one built for affiliates
specifically.

### 7.2 Data model

```
AffiliateProgram
  id                 uuid, pk
  creator_id         uuid, fk -> User
  offering_type      enum: membership_tier | digital_product | course
  offering_id        uuid
  commission_percent  decimal
  status             enum: active | paused

AffiliateLink
  id            uuid, pk
  program_id    uuid, fk -> AffiliateProgram
  affiliate_id  uuid, fk -> User
  code          string, unique  -- short referral code
  created_at    timestamp

AffiliateClick
  id                 uuid, pk
  affiliate_link_id  uuid, fk -> AffiliateLink
  occurred_at        timestamp
  referrer_host      string, nullable  -- same no-raw-IP/UA posture as Phase 1 link-click analytics (§4.3 of that spec)

AffiliateConversion
  id                       uuid, pk
  affiliate_link_id        uuid, fk -> AffiliateLink
  payment_transaction_id   uuid, fk -> PaymentTransaction
  commission_amount        decimal
  created_at               timestamp
```

- Attribution window: last-click within 30 days (a defensible industry-common
  default; confirm with product rather than treat as final, per §14).
- A conversion writes an `affiliate_commission`-kind `PaymentTransaction`
  (§3.1) crediting the affiliate's payout account — reusing the ledger rather
  than a separate payout table.
- If the affiliate has no `active` `CreatorPayoutAccount` yet, the conversion
  still records (so the earned commission isn't lost), but the corresponding
  `PaymentTransaction` stays `pending` until they onboard — an explicit
  product decision worth confirming (§14), not assumed silently correct.

### 7.3 Acceptance criteria

- [ ] Commission is only calculated and credited on a successful
      `PaymentTransaction`, never on a click alone.
- [ ] Attribution uses last-click-within-window, applied consistently, not
      first-click or all-clicks-credited (avoiding double-counted commission
      across multiple affiliates for one sale).
- [ ] Affiliate click analytics store no raw IP/user-agent, matching the
      privacy posture already established for link analytics in Phase 1.

## 8. Livestreams

### 8.1 Scope warning

Same category of infrastructure investment flagged for Phase 3 voice rooms
(that spec's §12.1) and Phase 4 appointments (§10.1) — real-time video
ingest, transcoding, and CDN delivery is a substantially larger lift than any
of the CRUD-shaped features elsewhere in this phase. Confirm appetite before
committing to a timeline alongside the rest of Phase 5.

### 8.2 Data model (MVP: single-host broadcast, no VOD by default)

```
Livestream
  id               uuid, pk
  creator_id       uuid, fk -> User
  title            string, 1-120 chars
  status           enum: scheduled | live | ended
  scheduled_at     timestamp, nullable
  started_at       timestamp, nullable
  ended_at         timestamp, nullable
  required_tier_id  uuid, fk -> MembershipTier, nullable  -- reuses §4.2's gating mechanism for paid livestreams
  ingest_key       string  -- opaque, infra-managed, never exposed to viewers
  playback_url     string
```

```
LivestreamChatMessage
  id              uuid, pk
  livestream_id   uuid, fk -> Livestream
  sender_id       uuid, fk -> User
  body            string, 1-500 chars
  created_at      timestamp
  deleted_at      timestamp, nullable
```

`LivestreamChatMessage` is structurally identical to Phase 3's
`CommunityChatMessage` (§11.1 of that spec) — a second instance of the same
"broadcast chat, no per-user read state" shape. Two instances doesn't yet
justify extracting a shared abstraction (per the standing "three similar
things before you generalize" guidance) — noted here so that if a third
broadcast-chat use case shows up later, this is the moment to unify them, not
before.

No recording/VOD in the default MVP, same reasoning Phase 3 gave for voice
rooms (§12.2 of that spec) — it sidesteps a chunk of content-moderation-of-
recordings scope. If VOD is wanted (e.g., a paid livestream a subscriber can
watch after the fact), that's a deliberate scope addition to confirm, not an
assumed default.

### 8.3 Acceptance criteria

- [ ] A viewer without a qualifying `MembershipSubscription` cannot obtain a
      valid `playback_url` for a tier-gated livestream.
- [ ] Chat messages from a source with no valid session for that livestream
      are rejected server-side.
- [ ] `ingest_key` is never returned in any viewer-facing API response — only
      to the creator's own broadcasting client.

## 9. Podcasts

### 9.1 Data model

```
Podcast
  id            uuid, pk
  creator_id    uuid, fk -> User
  title         string, 1-120 chars
  description   string, 0-2000 chars
  cover_url     string
  rss_slug      string, unique

PodcastEpisode
  id               uuid, pk
  podcast_id       uuid, fk -> Podcast
  episode_number   integer
  title            string, 1-120 chars
  description      string, 0-2000 chars
  audio_url        string
  duration_s        integer
  publish_at        timestamp
  required_tier_id   uuid, fk -> MembershipTier, nullable  -- member-only bonus episodes, reuses §4.2
```

### 9.2 RSS distribution and the gated-episode caveat

Public podcast distribution (Apple Podcasts, Spotify, etc.) works by polling a
public RSS/XML feed URL — there is no login step in that ecosystem. This
creates a real, industry-wide limitation worth stating explicitly rather than
quietly building something that looks secure and isn't: **a gated episode
cannot be included in the public feed**, because the feed itself is the only
thing podcast apps read, and it has no concept of per-listener auth.

The standard mitigation, which this phase should implement rather than
skip, is a **private feed token per subscriber**:

```
PodcastFeedToken
  id             uuid, pk
  podcast_id     uuid, fk -> Podcast
  subscriber_id  uuid, fk -> User
  token          string, unique  -- embedded in a private feed URL, e.g. /podcast.rss?t=token
  created_at     timestamp
  revoked_at     timestamp, nullable
```

A subscriber's private feed URL includes gated episodes they qualify for; the
public feed never does. This is "gating by obscurity plus revocability," not
cryptographic access control — if a private URL leaks, the content is exposed
until the token is revoked and reissued. That's a limitation of the podcast
distribution ecosystem itself, not something this spec can architect around,
and it should be communicated to creators as such (e.g., "don't post your
private feed link publicly") rather than left as a silent assumption.

### 9.3 Acceptance criteria

- [ ] The public RSS feed for a podcast never includes an episode with a
      non-null `required_tier_id`.
- [ ] A subscriber's private feed URL includes only episodes they currently
      qualify for at request time (re-checked per feed fetch, not baked in at
      token-issuance time) — so a lapsed subscription stops seeing new gated
      episodes without needing a new token.
- [ ] Revoking a `PodcastFeedToken` invalidates that specific URL immediately.

## 10. Newsletter

### 10.1 Data model

```
NewsletterSubscription
  id                  uuid, pk
  creator_id          uuid, fk -> User
  subscriber_user_id  uuid, fk -> User, nullable  -- nullable to allow email-only subscribers with no 0dot account
  subscriber_email    string
  subscribed_at       timestamp
  unsubscribed_at     timestamp, nullable

NewsletterIssue
  id                uuid, pk
  creator_id        uuid, fk -> User
  subject           string, 1-150 chars
  body              text  -- sanitized markdown/HTML, same posture as every other user-authored content field since Phase 1 §7.2
  required_tier_id  uuid, fk -> MembershipTier, nullable  -- reuses §4.2 for paid-only issues
  status            enum: draft | scheduled | sent
  sent_at           timestamp, nullable
```

### 10.2 Compliance

Every sent issue must include a one-click unsubscribe link, and
`unsubscribed_at` must be honored before any subsequent send — this is a
legal requirement (CAN-SPAM in the US, GDPR-adjacent consent rules in the EU),
not a UX nicety, and is called out explicitly so it isn't treated as an
optional polish item during implementation.

### 10.3 Acceptance criteria

- [ ] An unsubscribed recipient (`unsubscribed_at` set) receives no further
      `NewsletterIssue` sends from that creator.
- [ ] A paid-only (`required_tier_id` set) issue is not delivered to a
      subscriber without a qualifying active membership at send time.

## 11. Online courses

### 11.1 Data model

```
Course
  id            uuid, pk
  creator_id    uuid, fk -> User
  title         string, 1-120 chars
  description   string, 0-2000 chars
  price         decimal, nullable  -- nullable if access is membership-tier-only, see below
  currency      string, nullable
  status        enum: draft | active | archived

CourseModule
  id           uuid, pk
  course_id    uuid, fk -> Course
  title        string, 1-120 chars
  position     integer

Lesson
  id              uuid, pk
  module_id       uuid, fk -> CourseModule
  title           string, 1-120 chars
  position        integer
  content_type    enum: video | text | download
  body            text, nullable        -- for content_type = text
  video_url       string, nullable      -- for content_type = video
  file_url        string, nullable      -- for content_type = download, same pre-signed pattern as §5.3

CourseAccessGrant
  id             uuid, pk
  course_id      uuid, fk -> Course
  user_id        uuid, fk -> User
  granted_via    enum: purchase | membership_tier
  source_id      uuid  -- the DigitalProductPurchase-equivalent purchase record or MembershipTier id, depending on granted_via

CourseProgress
  user_id       uuid, fk -> User
  lesson_id     uuid, fk -> Lesson
  completed_at  timestamp
  primary key (user_id, lesson_id)
```

A course is purchasable directly (one-time `price`, generating a
`CourseAccessGrant` the same way a digital-product purchase does, sharing the
`PaymentTransaction` ledger per §3.1) or bundled into a membership tier
(anyone with an active subscription at or above the required tier gets
`granted_via = membership_tier` access) — or both simultaneously. This reuses
every mechanism already built in this phase (payments backbone, tier gating)
rather than introducing course-specific purchase logic.

### 11.2 Acceptance criteria

- [ ] A user with neither a `CourseAccessGrant` nor a qualifying membership
      subscription cannot fetch lesson content (`video_url`/`file_url`/`body`)
      for a paid course, even by guessing lesson IDs.
- [ ] Losing membership access (cancelled/downgraded subscription) revokes
      `membership_tier`-granted course access at the next check, but a
      `purchase`-granted access persists regardless of subscription state —
      these are two independent grant types and must not be conflated.
- [ ] Lesson completion (`CourseProgress`) is only recorded for a user who
      currently has access, preventing progress records for content a user
      never actually had rights to view.

## 12. Notifications: new producers

- `new_subscriber` — fires to the creator when a `MembershipSubscription`
  becomes active.
- `tip_received` — fires to the creator on a successful `Tip`.
- `affiliate_conversion` — fires to the affiliate on a credited
  `AffiliateConversion`.
- `livestream_started` — fires to subscribed/qualifying fans when a
  creator's `Livestream.status` transitions to `live` (this one plausibly
  wants push delivery once mobile apps exist in Phase 15; in-app only for
  now, consistent with Phase 2 §4.3's decision to defer push).
- `newsletter_issue_published` intentionally does **not** generate an in-app
  notification — it's delivered via email itself (§10), and duplicating it as
  an in-app notification would be redundant noise for the same event.

## 13. Cross-cutting concerns

### 13.1 Security

- No raw payment card data anywhere (§3.5) — restated because it's the most
  important boundary in this entire phase.
- All paid-content delivery (digital downloads §5.3, course lessons §11,
  gated livestream playback §8.3, gated podcast episodes §9.2) is
  authorization-checked server-side at request time, never trusted from a
  client-reported "I have access" flag.
- `ingest_key` (livestreams) and processor account identifiers
  (`CreatorPayoutAccount.processor_account_id`) are never exposed in any
  public-facing API response.

### 13.2 Privacy

- Membership subscriber lists and newsletter subscriber lists are visible
  only to the creator themself, never public — a subscription is a purchase
  relationship, not a public follow (contrast with Phase 2's public-by-default
  follower lists, §3.4 of that spec — this is a deliberate difference, not an
  inconsistency, since financial/support-relationship data warrants tighter
  defaults than a public social graph).
- Tip messages (§6.1) are the one piece of this phase that's public by
  default (a visible "thank you" is often the point) — worth naming as the
  exception to the rule above, not an oversight.
- Checkout, membership-tier, course, and livestream-player UI meet the
  accessibility standing requirement from Phase 1 §7.3 — not restated in
  full per phase from here on.

## 14. Explicit open questions for product/finance sign-off

- **Platform fee percentage(s)** — likely to vary by feature (tips vs.
  memberships vs. course sales) or be flat; needs a finance decision, not an
  engineering default.
- **Refund/chargeback policy** (§3.4) — who absorbs a processor's chargeback
  fee, whether refunding a membership month revokes already-consumed access.
- **Affiliate commission accrual without a payout account** (§7.2) — does
  commission accrue as a pending balance indefinitely, or expire if the
  affiliate never onboards?
- **Livestream VOD** (§8.2) — confirmed out of scope for the MVP, or does a
  paid livestream need to remain watchable after the fact?
- **Attribution window length for affiliate links** (§7.2) — 30 days proposed,
  not confirmed.
- Given this phase builds the first real payment backbone, should **Phase 4's
  Business Store** (which deferred payments entirely, Phase 4 spec §8.2) be
  revisited to use these same rails once they exist, rather than waiting for
  Phase 9? This is a resequencing opportunity worth raising, not a decision to
  make unilaterally here.

## 15. Suggested build sequence within Phase 5

1. `CreatorPayoutAccount` + processor onboarding integration +
   `PaymentTransaction` ledger (§3) — nothing else in this phase can be built
   or even meaningfully tested without this existing first.
2. Tips (§6) — the smallest possible feature exercising the backbone
   end-to-end; a good first real transaction type to validate §3 works before
   building anything more complex on top of it.
3. `MembershipTier`/`MembershipSubscription` + the `required_tier_id` gating
   mechanism on `Post` (§4) — the gating primitive that §8–§11 all depend on.
4. Digital downloads (§5) — independent of membership gating, can be
   parallelized with step 3.
5. Online courses (§11) — depends on both the payments backbone (step 1) and
   tier gating (step 3).
6. Podcasts (§9), including the private-feed-token mechanism (§9.2) — the RSS
   distribution and gated-episode caveat deserve dedicated attention rather
   than being rushed alongside other features.
7. Newsletter (§10) — mostly independent; needs a transactional email
   sending dependency (infra concern outside this spec) and the compliance
   requirements in §10.2 built in from the start, not retrofitted.
8. Affiliate links (§7) — sequence after at least one purchasable offering
   type exists (tiers, downloads, or courses) since a program needs
   something to attach to.
9. Livestreams (§8) — sequence last, after the §14 VOD question is answered
   and given the infra scope flagged in §8.1, same reasoning as deferring
   Phase 3's voice rooms to the end of that phase.
