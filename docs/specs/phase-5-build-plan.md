# Phase 5 — Creator Platform: build plan (saved for later)

> Companion to the actual spec at
> [phase-5-creator-platform.md](phase-5-creator-platform.md); this is the
> implementation plan, not the spec itself. This session builds §0–§1 below
> (payments backbone + tips); §2 onward is saved for future sessions to pick
> up, same "one comprehensive plan, then section-by-section execution"
> rhythm as [phase-4-build-plan.md](phase-4-build-plan.md).

## Decisions on the spec's open questions (§14) and this session's scope

The user made two calls up front, both narrower-but-real rather than
placeholder:

1. **No live Stripe integration this session.** §3's `CreatorPayoutAccount`/
   `PaymentTransaction` are built against a processor-agnostic interface
   (`src/lib/payments.ts`'s `PaymentProcessor`), with a `StubPaymentProcessor`
   implementation wired in by default. Swapping in real Stripe Connect later
   means writing a second class that implements the same interface and
   flipping which one `getPaymentProcessor()` returns — the schema, ledger,
   gating, and every feature built on top (tips now, memberships/courses/etc.
   later) doesn't change shape when that happens.
2. **This session builds §3 (backbone) + §6 (tips) only.** Per the spec's own
   §15 suggested build sequence, steps 1–2 — the smallest slice that
   exercises the whole system end-to-end. §4 (membership tiers/gating) and
   everything after it (§5, §7–§11) are saved for a future session; they're
   listed at the bottom of this doc in the spec's own suggested order so a
   future session can pick up without re-deriving sequencing.

Remaining §14 open questions, decided (or explicitly deferred) for what this
session actually touches:

- **Platform fee percentage** — no finance decision exists yet, so a single
  placeholder constant (`PLATFORM_FEE_PERCENT = 0.1`, i.e. 10%) lives in
  `payments.ts`, applied uniformly to every `PaymentTransaction` kind rather
  than per-kind rates (§14 flags rates could differ by feature — deferred
  until finance actually says so). Named and comment-flagged as a stand-in,
  not treated as a real product decision.
- **Refund/chargeback policy** — not reachable this session (no refund UI/
  action is built; `PaymentTransaction.status = refunded` exists in the
  schema per spec §3.4 but nothing writes it yet). Still open.
- Every other §14 question (affiliate accrual, livestream VOD, attribution
  window) is out of scope for what's built this session — untouched.

## SQLite deviations (same posture as Phase 4's `Offering.price`)

- `PaymentTransaction.amount`/`platformFee`, `Tip.amount`: `Float`, not
  `Decimal` — Prisma's SQLite connector doesn't support `Decimal`, same
  documented deviation `Offering.price` already established in Phase 4.
- String-enum fields (`kind`, `status`, etc.) are `String` with a comment
  listing the allowed values, not a Prisma `enum` — SQLite has no native
  enum support, same convention every existing model in this schema follows.

## 0. Payments backbone (spec §3)

**Schema**: `CreatorPayoutAccount` (`userId` fk → `User`, unique — one per
user), `PaymentTransaction` (per spec §3.1's field list, `amount`/
`platformFee` as `Float` per the deviation above). `User` gains
`payoutAccount`, `paymentTransactionsAsPayer`, `paymentTransactionsAsPayee`
relations.

**`src/lib/payments.ts`**: `PaymentProcessor` interface
(`createPayoutAccount`, `charge`) + `StubPaymentProcessor` (the only
implementation this session; documented as instant-success/instant-active
since there's no real hosted onboarding or card network to wait on — real
Stripe Connect's `CreatorPayoutAccount.status` genuinely starts
`onboarding` until a webhook flips it, per spec §3.1/§4.3; the stub
short-circuits that for local testing, called out explicitly as a stub-only
shortcut, not a precedent for how the real integration should behave).
`getPaymentProcessor()` returns the stub — the one line a future session
changes to switch processors. `recordPaymentTransaction()` — the shared
ledger-write helper every money-moving feature calls (just `tips.ts` this
session; the acceptance criterion in spec §3.5 that every kind produces
exactly one row is enforced by funneling all of them through this one
function, not by convention).

**`src/app/actions/payments.ts`**: `startCreatorOnboarding` — creates the
caller's `CreatorPayoutAccount` if absent, calls
`processor.createPayoutAccount()`, stores the resulting status. Idempotent
(calling again on an existing `active` account is a no-op) so the settings
UI can safely re-POST.

**UI**: a "Monetization" section on `/s/[username]` (owner-only settings,
same surface Phase 1 already uses for profile/link management) showing
payout status and an "Enable payouts" button wired to the action above.

### Acceptance criteria carried over from spec §3.5

- [ ] No raw payment card data anywhere — trivially true this session since
      the stub processor never touches card data at all.
- [ ] Every `PaymentTransaction` row has non-null `platformFee` and
      `processorReference` — enforced by `recordPaymentTransaction()` being
      the only write path.
- [ ] A creator cannot receive a payout-requiring transaction until
      `CreatorPayoutAccount.status = active` — checked in `tips.ts`'s
      `sendTip` before charging.

## 1. Tips (spec §6)

**Schema**: `Tip` (per spec §6.1, `amount` as `Float`, `paymentTransactionId`
fk → `PaymentTransaction`, unique — one ledger row per tip, never shared).
`User` gains `tipsSent`/`tipsReceived` relations.

**`src/app/actions/tips.ts`**: `sendTip` — `requireVerifiedUser`; target
resolved by recipient handle; rejects self-tips; rejects if the recipient has
no `active` `CreatorPayoutAccount` (spec §3.5's third criterion, the literal
gate); rate-limited per sender (`checkRateLimit`, mirrors `reviews.ts`'s
`checkReviewRateLimit` shape); amount validated (positive, two-decimal cents
precision, a sane per-tip ceiling); charges via
`processor.charge()`, then — only on a `succeeded` charge —
`recordPaymentTransaction()` + `Tip.create` in one `db.$transaction`, same
"ledger write and the feature row must not drift apart" reasoning
`toggleRepost`'s BUGS.md fix (#5, this session's earlier commit) already
established for a different table pair.

**Notifications**: `tip_received` producer added to `notifications.ts`
(`notifyTipReceived`), fires to the creator on a successful tip — added to
the `NotificationInput.type` union, `getNotificationVerb`, and
`getNotificationHref` (subjectId is the tipper's handle, so the link goes to
whoever sent it, mirroring `new_follower`'s exact precedent).

**UI**: a "Send a tip" button on the public profile page (`/[username]`),
shown to any signed-in viewer who isn't the profile owner, only when the
profile owner's `CreatorPayoutAccount.status = active` — a small
amount+message form, same `useActionState` client-form pattern as
`EditProfileForm.tsx`. Tip messages are public per spec §13.2 (the one
exception to this phase's "financial data is private by default" rule) —
shown inline near the tip button or on the profile itself; kept minimal this
session (a simple "recent tips" list), not a dedicated tips feed/page.

### Acceptance criteria carried over from spec §6.2

- [ ] A `Tip` row is never created without a corresponding successful
      `PaymentTransaction` — enforced by creating both in the same
      transaction, only reached after `processor.charge()` returns
      `succeeded`.

## Verification (same rhythm as every prior phase)

- `npx prisma migrate dev`, `npx tsc --noEmit`, `npm run lint` clean.
- Manual smoke test via the dev server: enable payouts on one account,
  confirm status flips to `active`; send a tip from a second account, confirm
  a `PaymentTransaction` + `Tip` row both exist, the recipient gets a
  notification, and the tip message shows publicly; confirm tipping is
  blocked before payouts are enabled and blocked for a self-tip.

---

## Saved for a future session: §2 onward (not built this session)

Per spec §15's suggested build sequence, in order, each depending on what
came before:

1. **Membership tiers + `required_tier_id` gating on `Post`** (spec §4) —
   the gating primitive §5/§8–§11 all depend on. Depends only on this
   session's backbone (§0 above).
2. **Digital downloads** (spec §5) — independent of tier gating, can be
   parallelized with step 1. Spec §5.1 flags this is very likely the same
   feature as Phase 9's Marketplace "digital products" — build the real
   model here, let Phase 9 add cross-creator discovery on top later, not a
   second product-and-purchase model.
3. **Online courses** (spec §11) — depends on both the backbone and tier
   gating (steps 0–1 above).
4. **Podcasts** (spec §9), including the private-feed-token mechanism
   (§9.2) — deserves dedicated attention for the gated-episode/RSS caveat,
   not rushed alongside other features.
5. **Newsletter** (spec §10) — needs a transactional email sending
   dependency (infra concern outside any spec) and the CAN-SPAM/GDPR
   unsubscribe requirements (§10.2) built in from the start.
6. **Affiliate links** (spec §7) — sequence after at least one purchasable
   offering type exists (tiers, downloads, or courses).
7. **Livestreams** (spec §8) — sequence last; real-time video ingest/
   transcoding/CDN delivery is a substantially larger infra lift than
   anything else in this phase (§8.1) and the §14 VOD question needs an
   answer first.

The five §14 open questions not resolved by this session's build (platform
fee *rates by feature*, refund/chargeback policy, affiliate accrual without
a payout account, livestream VOD, affiliate attribution window) all remain
open — see spec §14 directly.
