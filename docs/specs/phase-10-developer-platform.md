# Phase 10 — Developer Platform Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-5-creator-platform.md](phase-5-creator-platform.md), [phase-6-portfolio.md](phase-6-portfolio.md), [phase-7-knowledge.md](phase-7-knowledge.md), [phase-8-events.md](phase-8-events.md), [phase-9-marketplace.md](phase-9-marketplace.md)

## 1. Purpose & Scope

Phase 10 builds the public API, OAuth ("Sign in with 0dot"), SDKs, webhooks,
a GraphQL API, and a developer dashboard. It also resolves a sequencing
conflict Phase 9 named explicitly: a real third-party app ecosystem needs
OAuth/API/webhook primitives that didn't exist yet (Phase 9 §4.2), so Phase 9
scoped its "Apps" marketplace category down to sandboxed, API-less widgets.
This phase is where that gets a real upgrade path (§7).

**"Sign in with 0dot" is arguably the single most strategically important
feature in this entire roadmap**, not one bullet among six — the roadmap's
own mission statement ("Build the world's digital identity platform... One
Identity. One Profile.") is exactly what an identity provider capability
delivers: 0dot becomes the login for other sites and apps, not just a site
with its own login. That framing should shape prioritization within this
phase, not just its data model.

**In scope:** `DeveloperApp` registration, an OAuth2 authorization
server, a versioned public REST API, webhooks (reusing the existing
Notification event taxonomy), a developer dashboard, and the upgrade path
that lets Phase 9 app listings become real API-integrated applications.
**Out of scope:** building GraphQL and REST as two independently-maintained
parity implementations (§6 — recommends one thin shared layer instead);
escrow/marketplace-specific concerns (Phase 9's territory); requiring every
Phase 9 sandboxed-widget listing to migrate to this system (coexistence is
the default, see §7.3).

## 2. Success Criteria

- A third-party website can implement "Sign in with 0dot" using a standard
  OAuth2 authorization-code-with-PKCE flow, and a user can see and revoke
  that access afterward from their own account settings.
- No privacy or visibility rule established in Phases 1–9 (private notes,
  blocked users, gated podcast episodes, muted community members, private
  membership subscriber lists, and everything else) is re-implemented for
  the API and accidentally gotten wrong — the API calls into the same
  authorization logic the main application already uses (§5.1).
- A developer can register an app, request scopes, and — once approved for
  any sensitive ones — start receiving webhook events and making API calls,
  all from one dashboard, with no separate registration path for different
  parts of the platform.
- Phase 9's sandboxed-widget "Apps" category and this phase's real
  API-scoped apps coexist without forcing a disruptive migration of
  existing listings.

## 3. Developer identity: `DeveloperApp`

### 3.1 Data model

```
DeveloperApp
  id                    uuid, pk
  owner_type            enum: user | business
  owner_user_id         uuid, fk -> User, nullable
  owner_business_id     uuid, fk -> Business, nullable
  -- two-way owner XOR, same idiom as Phase 9's marketplace seller (§4.3 of that spec) — communities don't build apps, same exclusion applied consistently
  name                  string, 1-100 chars
  description           string, 0-1000 chars
  client_id             string, unique
  client_secret_hash    string  -- hashed at rest; the raw secret is shown exactly once, at creation, never retrievable afterward — same non-negotiable posture as Phase 1's password_hash (§3.1 of that spec)
  redirect_uris         jsonb[]  -- exact-match allowlist, no wildcard matching (see §4.3)
  status                enum: active | suspended
  created_at            timestamp
```

**Every** API/webhook consumer registers a `DeveloperApp` — including a
business's own internal integration (e.g. "notify our internal system when
we get an order"). There is no separate, lighter-weight path for
first-party/self-use automation; one consistent identity and credential
model applies to every API consumer, first-party or third-party. This is
flagged as a real trade-off, not an obviously-correct default — see §8.

### 3.2 Acceptance criteria

- [ ] `client_secret_hash` is never returned by any API response after the
      initial creation call — not even to the owning `DeveloperApp`'s own
      dashboard.
- [ ] `redirect_uris` are matched exactly (scheme, host, path, query) at
      authorization time — no prefix or wildcard matching, which is a
      classic OAuth open-redirect vulnerability class.

## 4. OAuth ("Sign in with 0dot")

### 4.1 Scopes: curated and versioned, not free-form

```
OAuthScope
  key            string, pk  -- e.g. "profile:read", "posts:write", "messages:read"
  description    string
  sensitivity     enum: low | medium | high

DeveloperAppScope
  app_id      uuid, fk -> DeveloperApp
  scope_key   string, fk -> OAuthScope
  primary key (app_id, scope_key)  -- scopes the app is registered/approved to request; a user may still decline some at grant time
```

### 4.2 Authorization and tokens

```
OAuthAuthorization
  id               uuid, pk
  app_id           uuid, fk -> DeveloperApp
  user_id          uuid, fk -> User
  granted_scopes   string[]  -- the subset of DeveloperAppScope the user actually approved
  status           enum: active | revoked
  created_at       timestamp
  revoked_at       timestamp, nullable

OAuthToken
  id                     uuid, pk
  authorization_id       uuid, fk -> OAuthAuthorization
  access_token_hash      string, unique  -- hashed at rest, same posture as client secrets (§3.1) — a leaked database must not yield usable bearer tokens
  refresh_token_hash     string, unique, nullable
  expires_at             timestamp
  created_at             timestamp
```

Standard OAuth2 authorization-code flow; **PKCE is required for any client
that cannot hold a secret safely** (native mobile apps, single-page
web apps) — this matters concretely for this platform since Phase 15's
mobile apps will eventually be OAuth clients too, and a confidential-client-
only design would leave them with no safe flow.

### 4.3 Sensitive scopes get an additional review gate

Requesting a `sensitivity: high` scope (e.g. reading private messages,
posting on a user's behalf, accessing payout information) requires the
`DeveloperApp` to pass a review step before that scope can be requested from
users at all — not merely disclosed to the user at grant time. This is at
least the fourth time this series has required a review gate before
something goes live: restricted-community joins (Phase 3 §3.1), business
claims (Phase 4 §3.3), marketplace listings (Phase 9 §4.5), and now
high-sensitivity OAuth scopes. The recurrence is worth naming rather than
treating each as an isolated one-off decision.

### 4.4 Acceptance criteria

- [ ] A `DeveloperApp` cannot request a `high`-sensitivity scope from any
      user until it has passed the review gate for that scope.
- [ ] A public (non-confidential) client cannot complete the authorization
      flow without PKCE.
- [ ] Revoking an `OAuthAuthorization` immediately invalidates its
      associated `OAuthToken` rows — a revoked authorization cannot continue
      to be used via an already-issued access token past revocation.
- [ ] Every user has an account-settings view listing active
      `OAuthAuthorization`s with their granted scopes and a one-click revoke
      — this is a requirement, not a nice-to-have, given it's the practical
      mechanism for the data-access transparency implied by "Sign in with
      0dot" existing at all.

## 5. Public API

### 5.1 The API must not become a second, less-careful implementation of access rules

By this phase, nine prior specs have accumulated a real number of
visibility/privacy rules: private notes and wikis (Phase 7), blocked users
(Phase 2), muted community members (Phase 3), gated podcast episodes and
membership-tier content (Phase 5), private membership subscriber lists
(Phase 5), verified-purchase-gated marketplace reviews (Phase 9), and more.
**The public API must call into the exact same authorization and
serialization logic the main application already uses for these — not a
separately implemented data-access layer that has to independently
re-encode every one of those rules correctly.** A new access surface is
precisely where such rules tend to get quietly forgotten; the API existing
at all is a reason for extra caution here, not an excuse to move faster by
reimplementing.

### 5.2 Versioning

URL-path versioning (e.g. `/v1/...`) is recommended as a reasonable default
for simplicity and cacheability — not a rigid mandate, but a concrete
starting position rather than leaving the question open. A deprecation
policy (how long an old version stays supported after a new one ships) needs
product input (§8), since it's a support-cost/compatibility trade-off, not
an engineering default.

### 5.3 Rate limiting and usage tracking at a different scale than prior phases

Every API request is authenticated to a `DeveloperApp` and rate-limited
against it (tiered by review/trust status — an unreviewed new app gets
lower default limits than an established one, another instance of the
"trust level gates capability" pattern already used for business
verification and marketplace-listing review). Usage is tracked as
**aggregated rolling-window counters** (e.g. per-hour/per-day buckets), not
an indefinite per-request log — a deliberate departure from the
append-only-event-log pattern used for lower-volume analytics elsewhere in
this series (Phase 1 link clicks, Phase 5 affiliate clicks), because API
request volume is orders of magnitude higher and indefinite per-request
retention isn't appropriate at that scale.

### 5.4 Acceptance criteria

- [ ] Every API response respecting a visibility rule (private, unlisted,
      blocked, gated) produces the identical result the web UI would show
      the same authenticated identity — verified by shared code path, not
      independently re-tested per rule.
- [ ] Rate limits are enforced per `DeveloperApp`, not per underlying user
      session, so one app's traffic can't exhaust another's quota.
- [ ] API usage data is retained as aggregated counters; no indefinite
      per-request log is kept.

## 6. GraphQL: a second surface, deliberately sequenced, not a parallel build

Maintaining REST and GraphQL as two independently hand-built
implementations risks exactly the kind of drift §5.1 warns against for
authorization rules — two surfaces that are supposed to enforce the same
rules but were coded twice. Recommended approach: GraphQL resolvers are a
thin layer over the **same** service/authorization code the REST API calls
into — same scope checks, same rate limiting, same underlying data access —
so the two surfaces can't diverge in what they permit. If maintaining true
feature parity between REST and GraphQL proves too costly, product should be
prepared to make GraphQL a deliberately limited, read-oriented surface
rather than let the two silently drift apart — this is a call worth making
explicitly rather than discovering later that they've fallen out of sync.

### 6.1 Acceptance criteria

- [ ] No authorization or scope check exists in the GraphQL resolver layer
      that doesn't also exist in the REST layer (or vice versa) — verified
      by both calling the same underlying authorization functions.

## 7. Webhooks

### 7.1 Reusing the existing event taxonomy, not inventing a second one

Every phase since Phase 2 has extended `Notification.type`/`subject_type` —
Phase 3's `community_invite`, Phase 4's `business_review`/
`job_application`/`appointment_*`, Phase 5's `new_subscriber`/
`tip_received`/`affiliate_conversion`, Phase 8's `event_reminder`/
`event_cancelled`/`ticket_purchased`, and more. **Webhooks expose this same
event catalog externally rather than inventing a second, parallel event
vocabulary.** The Notification system effectively becomes the platform's
internal event bus, and this phase adds a second consumer (external HTTP
delivery) alongside the existing one (in-app notification).

```
WebhookSubscription
  id             uuid, pk
  app_id         uuid, fk -> DeveloperApp
  event_types    string[]  -- drawn from the existing Notification type/subject_type catalog
  target_url     string  -- must be https
  secret         string  -- HMAC signing secret, shown once, used to sign delivered payloads so receivers can verify authenticity
  status         enum: active | disabled
  created_at     timestamp

WebhookDelivery
  id                 uuid, pk
  subscription_id    uuid, fk -> WebhookSubscription
  event_type         string
  payload            jsonb
  status             enum: pending | delivered | failed
  attempt_count      integer, default 0
  last_attempted_at  timestamp, nullable
  next_retry_at      timestamp, nullable
  created_at         timestamp
```

Delivery uses exponential backoff with a capped number of attempts over a
bounded window (exact numbers are an infra-tuning detail, not fixed here);
a subscription is auto-disabled after sustained failure, both to stop
retrying into a dead endpoint indefinitely and to signal the developer that
something needs attention (`webhook_disabled` — a new `Notification.type`
value, since this isn't like/comment-shaped, consistent with when this
series has added new types before). `Notification.subject_type` gains
`developer_app`.

### 7.2 Webhooks are scoped, not a platform-wide firehose

A `WebhookSubscription`'s `event_types` are only ever delivered for users
who have an `active` `OAuthAuthorization` granting that app the
corresponding scope — an app cannot subscribe to, say, `message` events for
the entire platform; it can only receive them for users who specifically
authorized it to read messages. This ties webhook delivery directly to the
OAuth scope model in §4 rather than treating the two features as
independent.

### 7.3 Acceptance criteria

- [ ] A webhook subscription for an event type gated behind a scope the app
      doesn't hold (or a specific user hasn't granted) never delivers events
      for that scope/user pair.
- [ ] A subscription auto-disables after its failure threshold and produces
      a `webhook_disabled` notification to the app's owner.
- [ ] Every delivered payload is HMAC-signed with the subscription's secret,
      verifiable by the receiver.

## 8. Resolving Phase 9's Apps sequencing question

Phase 9 §4.2 flagged that a real third-party app ecosystem couldn't exist
before this phase, and scoped `MarketplaceListing(category = app)` down to
sandboxed, declarative widgets with no API access. Now that `DeveloperApp`/
OAuth/webhooks exist, the upgrade path is additive, not a forced migration:

```
MarketplaceListing gains:
  developer_app_id   uuid, fk -> DeveloperApp, nullable
```

- When `developer_app_id` is null, a listing behaves exactly as Phase 9
  specified — a sandboxed widget, no API access, nothing about it changes.
- When set, installing the listing (`InstalledApp`, Phase 9 §4.3) triggers
  the real OAuth authorization flow, granting that `DeveloperApp` the scopes
  it's registered for and the user approves — the installed "app" becomes a
  genuine API-integrated application rather than a widget config.
- **Existing Phase 9 listings are not required to migrate.** Both models
  coexist indefinitely; a widget-only listing is a legitimate, permanent
  category, not a stepping stone every app must eventually leave.

### 8.1 Acceptance criteria

- [ ] A `MarketplaceListing` with `developer_app_id = null` is entirely
      unaffected by this phase's schema additions.
- [ ] Installing a `developer_app_id`-linked listing produces a real
      `OAuthAuthorization`, not just an `InstalledApp` row with a config
      blob.

## 9. Developer dashboard

Primarily a rendering surface over the entities already defined above —
`DeveloperApp` management (credential rotation, redirect URI configuration),
scope requests and their review status, webhook subscription management and
delivery logs, and API usage against the aggregated counters from §5.3. Like
Phase 6's Resume section (§6.2 of that spec), this is a view over existing
data, not a new data island — worth naming as a deliberate consistency with
that earlier reasoning rather than an afterthought.

## 10. SDKs

Primarily a maintained-software deliverable (client libraries per language),
not a data-modeling concern. The one decision this spec surfaces: SDK
version support needs to track the API versioning/deprecation policy from
§5.2 — an SDK claiming to support an API version the platform has since
deprecated is a support liability, so the two policies should be defined
together, not independently.

## 11. Search integration: none

Unlike every content-bearing phase since Phase 3, this phase adds no search
surface — a `DeveloperApp` is dashboard tooling, not discoverable consumer
content. Noted explicitly so its absence reads as a deliberate assessment
rather than an oversight, consistent with how earlier phases have called out
what's deliberately *not* built (e.g. Phase 6 §10 excluding skills/
certificates from independent search).

## 12. Cross-cutting concerns

### 12.1 Security

- Client secrets and access/refresh tokens are stored hashed, never in
  retrievable plaintext (§3.1, §4.2) — the same non-negotiable posture as
  Phase 1 password storage.
- Redirect URIs are exact-match validated (§3.2) — no open-redirect surface.
- PKCE is required for public clients (§4.2).
- The API reuses existing authorization/serialization logic rather than
  reimplementing access rules (§5.1) — the single most important security
  property of this entire phase.
- Sensitive scopes require a review gate before they can be requested from
  users at all (§4.3).

### 12.2 Privacy

- Users can view and revoke any app's access at any time (§4.4) — the
  practical transparency mechanism behind offering third-party sign-in at
  all.
- Webhook delivery is scoped per-authorization, never platform-wide (§7.2).
- Developer dashboard UI meets the accessibility standing requirement from
  Phase 1 §7.3 — not restated in full per phase from here on.

## 13. Explicit open questions for product sign-off

- **API versioning/deprecation policy** (§5.2): URL-path versioning
  recommended, but the support window for deprecated versions needs a
  product decision, coordinated with SDK support policy (§10).
- **GraphQL scope** (§6): full feature parity with REST, or a deliberately
  limited, read-oriented surface? Recommend deciding explicitly rather than
  letting scope emerge by default.
- **Universal `DeveloperApp` registration requirement** (§3.1): is requiring
  every API/webhook consumer — including low-stakes first-party automation
  like "notify our business of a new order" — to register a full
  `DeveloperApp` the right amount of friction, or does that case deserve a
  lighter-weight path? Flagged as a real trade-off, not an obviously correct
  default.
- **Rate limit tiers and quotas** (§5.3): specific numbers need product/infra
  input, not an engineering default.
- **Sensitive-scope review depth** (§4.3): manual review only, or additional
  automated vetting for high-sensitivity scope requests, mirroring the
  question Phase 9 §8 raised about marketplace listing review depth?

## 14. Suggested build sequence within Phase 10

1. `DeveloperApp` + hashed client credentials + redirect URI allowlist +
   dashboard shell (§3) — the foundational identity everything else in this
   phase depends on.
2. `OAuthScope` taxonomy + `DeveloperAppScope` + the sensitive-scope review
   gate (§4.1, §4.3).
3. OAuth2 authorization-code + PKCE flow → `OAuthAuthorization`/`OAuthToken`
   (§4.2) — "Sign in with 0dot" ships here; treat as the flagship deliverable
   of this phase per §1, not just one item in sequence.
4. Public REST API, built as a thin layer over existing authorization/
   serialization logic (§5.1) — the highest-risk step in this phase if
   rushed, given §5.1's warning; verify against the accumulated visibility
   rules from Phases 1–9 before considering this done.
5. Rate limiting + aggregated usage counters + dashboard usage view (§5.3).
6. Webhooks: `WebhookSubscription`/`WebhookDelivery` + retry/backoff +
   auto-disable, scoped to existing OAuth authorizations (§7).
7. Resolve Phase 9's Apps sequencing question: `MarketplaceListing.
   developer_app_id` + OAuth-triggering install flow (§8) — depends on
   steps 1–3 existing.
8. GraphQL as a thin layer over the same service code as REST (§6) —
   sequenced deliberately last, and only after the parity-vs-limited-scope
   question (§13) is answered.
9. SDKs, versioned alongside the API's own deprecation policy (§10) —
   an ongoing maintenance deliverable, not a one-time build step.
