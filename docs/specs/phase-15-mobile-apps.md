# Phase 15 — Mobile Apps Spec

Status: Built (partial) — PWA + native Expo iOS/Android app shipped; no dedicated desktop app (the PWA covers that). The native app was then taken to near-web-parity by `addendum-mobile-pro-upgrade.md` (M1–M14). This spec describes target state and is not edited to match the implementation — see `../ROADMAP.md`'s build-status table, `../../README.md`, and `../foundations/MOBILE.md`.
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md), [phase-10-developer-platform.md](phase-10-developer-platform.md), [phase-11-ai-platform.md](phase-11-ai-platform.md)

## 1. Purpose & Scope

Phase 15 is architecturally different from every phase before it: it adds
almost no new server-side business logic and is instead about new *client
surfaces* consuming the platform Phases 1–14 already built. Its most
important architectural move is that 0dot's own first-party apps should
consume the exact same public API and OAuth mechanics Phase 10 built for
third-party developers (§3), rather than a privileged internal-only path —
which is also the moment several notification deferrals scattered across
five prior phases finally get resolved (§4), and the moment an App
Store/Play Store compliance question surfaces that carries real business
and legal consequence disproportionate to its size (§6).

**In scope:** first-party apps as genuine OAuth clients; push notification
delivery as a third channel on the existing event catalog; universal/app
link handling across every existing URL namespace; a client-architecture
recommendation; PWA/offline scoping; the in-app-purchase compliance
question this phase cannot avoid.
**Out of scope:** a full offline write-queueing/conflict-resolution engine
at launch (§5.2 — scope warning, same category as this series' other
heavy-infra flags); WebAuthn/passkey as a new primary authentication method
(§7 — distinct from simple biometric app-unlock, and not something the
roadmap explicitly asked for); a fully resolved App Store/Play Store
revenue-sharing strategy (§6 — flagged as needing dedicated legal/business
work, not decided unilaterally here).

## 2. Success Criteria

- 0dot's own iOS/Android/desktop apps authenticate through the identical
  OAuth2 + PKCE flow Phase 10 built for external developers, proving that
  API and flow actually work for the platform's own most important client,
  not just in theory for third parties.
- Every notification type that multiple prior phases said "wants push once
  mobile apps exist" (Phase 2 §4.3's general deferral, Phase 5 §12's
  livestream-started, Phase 8 §8.3's event-cancelled/ticket-purchased) is
  resolved through one shared push mechanism, not five separate ad hoc
  fixes.
- No push notification payload leaks private content (a DM body, a private
  note) onto a lock screen — payloads respect the same sensitivity-
  inheritance principle Phase 11 §3.2 established for AI generation logs.
- The in-app-purchase question is named with the seriousness it deserves —
  getting it wrong risks app store rejection and a materially different
  revenue-share outcome, not just a suboptimal engineering choice.

## 3. First-party apps as real OAuth clients

### 3.1 A gap surfaces in Phase 10's ownership model

Phase 10's `DeveloperApp.owner_type` (§3.1 of that spec) is `user | business`
— there's no representation for "owned by 0dot itself," which this phase
actually needs: the iOS, Android, and desktop apps should each register as
a proper `DeveloperApp` the same way a third-party developer would.
Recommend **not** widening the enum with a `platform` value for what is
effectively a handful of apps, not a recurring category — instead, use a
designated, platform-operated `User` (or `Business`) record that owns these
`DeveloperApp` registrations through the existing two-way model. This
avoids every downstream piece of code that switches on `owner_type` needing
a new case for something that happens a handful of times total, not
per-customer — a deliberate reuse-over-enum-growth choice, consistent with
this series' preference for matching structural width to actual
cardinality rather than adding a case for a singular, non-repeating need.

### 3.2 Native PKCE, already anticipated

First-party mobile apps are exactly the "client that cannot hold a secret
safely" case Phase 10 §4.2 required PKCE for. No new authorization mechanism
is needed — this phase is simply the first real exercise of a requirement
Phase 10 stated in anticipation of it.

### 3.3 First-party UX can differ; the security model must not

A first-party app can reasonably skip the explicit "App X wants access to
Y" consent screen a third-party app would show — a user installing "the
0dot app" has already expressed a different level of trust than installing
an unrelated third-party integration. The underlying mechanics should not
differ, though: the same scoped tokens, the same revocability, and the same
"connected apps" management page Phase 10 §4.4 required must apply
uniformly — a user should still be able to see and revoke "0dot iOS App"
access from that same list, even though that might look unusual. Skipping
the consent *screen* is a UX decision; skipping the *transparency
mechanism* is not one this phase should make.

### 3.4 Acceptance criteria

- [ ] Every first-party app (iOS, Android, desktop) is a registered
      `DeveloperApp` owned by a designated platform account, not exempted
      from the OAuth model entirely.
- [ ] First-party apps authenticate via the same PKCE flow as any other
      public client — no separate, privileged authentication path.
- [ ] A first-party app's granted access still appears in, and can be
      revoked from, the user's connected-apps list (Phase 10 §4.4).

## 4. Push notifications: the third delivery channel on one event catalog

### 4.1 Resolving several scattered deferrals at once

Phase 2 §4.3 deferred all push/email delivery specifically because "push
needs device tokens, which need Phase 15 mobile apps... to exist first."
Phase 5 §12 flagged `livestream_started` as wanting push once mobile apps
exist. Phase 8 §8.3 flagged `event_cancelled`/`ticket_purchased` as strong
candidates for delivery beyond in-app. This phase resolves all three at
once with one mechanism, rather than three separate fixes:

```
DeviceToken
  id             uuid, pk
  user_id         uuid, fk -> User
  platform        enum: ios | android | web_push
  token           string  -- opaque APNs/FCM/Web-Push token
  app_client_id     string, fk -> DeveloperApp.client_id  -- which app (per §3) registered this token
  created_at        timestamp
  last_seen_at       timestamp
  -- unique (user_id, token)

NotificationDeliveryPreference
  user_id             uuid, fk -> User
  notification_type    string  -- drawn from the existing Notification.type catalog
  channel               enum: in_app | push | email
  enabled                boolean, default true
  primary key (user_id, notification_type, channel)
```

### 4.2 Same event catalog, third channel — not a fourth notification system

Phase 10 §7.1 already established the pattern: "every event type available
for in-app notification since Phase 2 becomes available as a webhook
subscription topic." Push is simply a **third** delivery channel for that
exact same catalog — no new event taxonomy, no new `Notification.type`
values needed for this phase. In-app (Phase 2), webhook (Phase 10), and now
push all deliver the same underlying events; only the transport differs.

### 4.3 Payload content must respect the same sensitivity-inheritance principle as Phase 11

Phase 11 §3.2 established that an AI generation log about private content
is itself sensitive and must be handled accordingly. The identical
principle applies here, for a more exposed surface: a push notification
about a private DM (Phase 2) or a private note (Phase 7) must not embed
that content in the payload itself — push payloads are frequently cached by
the OS and can appear on a lock screen visible to anyone near the device,
an even more exposed surface than an internal audit log. Push copy should
be generic ("You have a new message from Alex"), not a rendering of the
private content it's about.

### 4.4 Acceptance criteria

- [ ] Every notification type flagged across Phases 2, 5, and 8 as
      "wants push once mobile exists" is deliverable via `DeviceToken` +
      `NotificationDeliveryPreference` — verified against each of those
      three specs' specific flagged items.
- [ ] No push payload for a notification whose subject is `private` (per
      that subject's own visibility field) includes the private content
      itself, regardless of platform.
- [ ] Revoking/logging out clears the associated `DeviceToken` — a stale
      token does not continue receiving pushes after logout.

## 5. Client architecture and platform scope

### 5.1 Five roadmap line items, likely fewer real build efforts

Building five fully independent native codebases (iOS, Android, tablet,
desktop, PWA) is unlikely to be the intended or sustainable interpretation
of five roadmap bullets. Recommend, as a starting position to confirm with
product/engineering leadership rather than a unilateral decision:
- **iOS, Android, and tablet** as one shared cross-platform codebase (e.g.
  React Native or Flutter) with responsive/adaptive layouts for the larger
  tablet form factor, reserving fully native platform-specific code only
  for what genuinely needs deep OS integration (widgets, share-sheet
  extensions, background push handling, biometric APIs) — not the whole
  app.
- **Desktop app** as the existing web app's PWA installed via standard
  browser installability APIs (manifest + service worker), rather than a
  sixth, separately-maintained native desktop codebase, unless a specific
  desktop-only capability is later identified that a PWA genuinely cannot
  provide.
- **PWA** is likely the cheapest of the five to ship, being built directly
  on the existing web application rather than a new codebase.

This reduces five roadmap line items to effectively two build efforts (one
shared mobile codebase, one installable web surface), which is a real
product/engineering tradeoff around team size, budget, and acceptable
native-feel quality bar — flagged for confirmation (§8), not assumed.

### 5.2 Offline support: read-caching now, write-queueing as a scope warning

Full offline-first behavior — a local persistent cache, conflict-free
queued writes, background sync — is a substantial engineering investment,
comparable to this series' other flagged heavy-infra items (Phase 3/5/8's
real-time infrastructure, Phase 5's payment backbone). Recommend scoping an
initial release to **read-time caching** (previously-viewed content
available offline via standard mobile-framework local storage or PWA
service-worker caching) while explicitly deferring **write-time offline
queueing** (posting, liking, commenting while offline, synced later) as a
fast-follow rather than a v1 requirement — the failure modes of queued-write
sync (conflicting edits, duplicate submissions, stale-data overwrites)
deserve dedicated design attention, not a bolt-on addition to a v1 client.

### 5.3 Universal/app links across every existing URL namespace

Every public URL namespace built since Phase 1 — `@username`, `/c/`, `/b/`,
`/p/`, `/e/` — needs to resolve correctly both in a mobile browser and
directly into the app via iOS Universal Links / Android App Links, which
requires standard domain-association files (`apple-app-site-association`,
`assetlinks.json`). This is a well-established technical requirement with
little design decision involved, but is worth naming explicitly since it
touches every namespace this entire roadmap has built, not just one.

### 5.4 Acceptance criteria

- [ ] A shared link to any existing public URL namespace opens directly in
      the installed app when available, and falls back correctly to a
      mobile browser otherwise.
- [ ] Offline mode (if shipped in v1) supports viewing previously-loaded
      content; no write action is silently queued and later replayed
      without an explicit design for conflict handling.

## 6. In-app purchases: a real compliance question, not a footnote

### 6.1 Why this matters more than its section length suggests

Phase 5 (memberships, tips, digital downloads, courses), Phase 8 (ticket
purchases), and Phase 9 (marketplace/app purchases) all built their payment
flows around 0dot's own processor (Stripe Connect via
`CreatorPayoutAccount`/`PaymentTransaction`). Apple's App Store Review
Guidelines (and Google Play's equivalent policy) generally **require**
purchases of digital goods and services initiated within a native app to
go through the platform's own in-app purchase system — with Apple/Google
taking their own cut (historically 15-30%), **independent of and in
addition to** whatever `platform_fee` 0dot itself charges (Phase 5 §3.2).
Getting this wrong risks app store rejection, not merely a suboptimal
business outcome — this is flagged with the same seriousness this series
has given other high-stakes items (Phase 8's recording consent, Phase 11's
CSAM pipeline, Phase 14's SSO identity-stranding risk), because the
consequence of an incorrect default here is concrete and immediate (app
removal), not a slow-building risk.

The exact rules are also **jurisdiction-dependent and actively evolving**
— the EU's Digital Markets Act and various US court rulings (e.g. Epic v.
Apple) have forced varying degrees of "link out to an external payment
page" allowance in different regions. This isn't a single fixed global
rule to hardcode once; it needs ongoing legal tracking.

### 6.2 A named abstraction finally gets its second value

Phase 5 §3.1 gave `CreatorPayoutAccount.processor` a single enum value
(`stripe_connect`) specifically "named explicitly even with one value, so
the abstraction is real, not aspirational" — anticipating exactly this
kind of second-processor need. This phase is where that anticipation pays
off:

```
PaymentTransaction (Phase 5) gains:
  processor    enum: stripe_connect | apple_iap | google_play_billing
  store_fee    decimal, nullable  -- the store's own cut, deducted separately from 0dot's existing platform_fee
```

A purchase made through a mobile app's native purchase flow (where store
policy requires it) records against the appropriate store processor instead
of Stripe Connect, with both fees — the store's and 0dot's own — accounted
for separately rather than conflated into one number.

### 6.3 A real reconciliation complication, not just a schema addition

Apple/Google in-app-purchase revenue arrives as an **aggregated lump-sum
payout to 0dot itself**, not routed directly to individual creators/sellers
the way Stripe Connect does. This means 0dot becomes an intermediary that
must internally track per-creator IAP-derived earnings and disburse them
through the existing `CreatorPayoutAccount` mechanism on its own schedule —
a meaningfully different money-flow topology than Phase 5's direct-Connect-
payout model, and a genuine operational/finance undertaking in its own
right, not something this schema addition alone resolves. This deserves its
own dedicated design and financial-operations work, flagged here rather
than fully specified, the same way this series has flagged other
disproportionately large sub-efforts (Phase 3/5/9's real-time and
escrow-adjacent scope warnings).

### 6.4 Acceptance criteria

- [ ] No native app purchase flow for a digital good/service category the
      relevant store policy covers bypasses that store's required
      in-app-purchase mechanism — verified against current store policy at
      implementation time, not assumed fixed.
- [ ] `PaymentTransaction.store_fee` and `platform_fee` are both recorded
      and both deducted before a creator/seller's net payout is computed —
      never conflated into a single fee figure.
- [ ] IAP-derived earnings are tracked per creator/seller and reconciled
      against the aggregated store payout before disbursement through
      `CreatorPayoutAccount` — not assumed to arrive already attributed.

## 7. Biometric app-unlock — modest scope, distinct from passkeys

Face ID / Touch ID / Android biometric unlock as a **local convenience**
gating access to an already-authenticated session token is low-complexity
and needs no new backend entity — it's a client-side unlock in front of an
existing valid session, not a new authentication method for the account
itself. This is explicitly distinct from WebAuthn/passkey support as a
first-class *account authentication method* (replacing or supplementing
password/OAuth login) — the roadmap doesn't ask for that here, and it's
flagged as a plausible future enhancement rather than built as part of this
phase, consistent with not adding functionality beyond what's asked for.

### 7.1 Accessibility

Native mobile/desktop/PWA UI meets the accessibility standing requirement
from Phase 1 §7.3 — including platform-native accessibility APIs
(VoiceOver, TalkBack) alongside the web-oriented WCAG conventions that
requirement was originally stated in terms of. Not restated in full per
phase from here on.

## 8. Explicit open questions for product/engineering sign-off

- **Client architecture (§5.1)**: confirm the shared-cross-platform-mobile
  + PWA-as-desktop recommendation, versus fully independent native
  codebases per platform — a real team-size/budget/quality-bar tradeoff
  this spec can't resolve unilaterally.
- **In-app-purchase compliance strategy (§6)**: this is the single most
  consequential open item in this phase — needs dedicated legal/business-
  development attention given evolving, jurisdiction-dependent store
  policy, not a decision made once and left static.
- **Offline write-queueing (§5.2)**: confirmed out of scope for v1, or does
  launch actually require queued writes given real-world spotty-connectivity
  use cases?
- **First-party consent-screen UX (§3.3)**: confirm skipping the explicit
  consent screen for 0dot's own apps is acceptable, while revocability
  remains uniformly available.
- **Desktop app (§5.1)**: PWA-installed, or does a specific desktop-only
  capability justify a separate native build?

## 9. Suggested build sequence within Phase 15

1. Designated platform-owned account + first-party `DeveloperApp`
   registrations + native PKCE OAuth flow (§3) — proves Phase 10's public
   API design actually works for its most important consumer before
   anything else in this phase is built on top of it.
2. `DeviceToken` + `NotificationDeliveryPreference` as the third delivery
   channel on the existing event catalog (§4) — resolves the Phase 2/5/8
   deferrals in one step.
3. Confirm client architecture (§8) before committing further engineering
   effort — this gates how much of the rest of this phase is one shared
   codebase versus several.
4. Universal/app link handling across all five existing URL namespaces
   (§5.3).
5. PWA: manifest + service worker + read-time offline caching (§5.2) —
   likely the fastest surface to ship given it builds directly on the
   existing web app.
6. In-app-purchase compliance (§6) — sequence with real care and dedicated
   legal/finance involvement; do not treat as a routine implementation task
   given the app-rejection and revenue-share stakes named in §6.1.
7. Biometric app-unlock (§7) — low-risk, client-side only, safe to slot in
   anywhere once step 1 provides a session to gate.
