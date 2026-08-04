# Phase 10 — Developer Platform: build plan (saved for later)

> Companion to the spec at [phase-10-developer-platform.md](phase-10-developer-platform.md).
> This session builds §14 steps 1–7 (`DeveloperApp` through the Phase 9 apps
> upgrade path) — the OAuth/API/webhook core. Steps 8–9 (GraphQL, SDKs) are
> deliberately deferred: §14 itself sequences GraphQL last and gates it on a
> product decision (§13) between full REST parity and a limited read-only
> surface; SDKs are "an ongoing maintenance deliverable, not a one-time build
> step" (§10). Building either now would mean guessing the open product
> question or building throwaway client code against an API that hasn't
> shipped yet.

## Schema

`DeveloperApp` (two-way owner XOR, `redirectUrisJson` following this
schema's `hoursJson`/`imagesJson` JSON-text-on-SQLite convention, not a
native array type — there is no native array type here), `OAuthScope`
(fixed catalog, seeded, not user-created), `DeveloperAppScope` (per-app
requested/approved scopes — `pending`/`approved`/`rejected`, auto-approved
for `low`/`medium` sensitivity, gated for `high` per spec §4.3),
`OAuthAuthorizationCode` (short-lived, spec doesn't name this table
explicitly but the authorization-code flow needs a persisted code between
the redirect and the token exchange — same shape as `PodcastFeedToken`'s
opaque-token-row precedent), `OAuthAuthorization`/`OAuthToken` (hashed
tokens per spec §4.2, §12.1), `WebhookSubscription`/`WebhookDelivery`,
`ApiUsageCounter` (aggregated per-app-per-hour rolling counters, spec
§5.3 — not a per-request log). `MarketplaceListing.developerAppId` per
spec §8.

## Reused-authorization posture (spec §5.1)

The REST API in this pass covers a representative endpoint set
(`/v1/users/me`, `/v1/profiles/:username`, `/v1/posts/:id`) that
demonstrates the required shape — each route resolves the bearer token to
a user via `resolveApiRequest`, then calls the *exact same* lib functions
the web UI already uses for visibility (e.g. `getCurrentUser`-equivalent
identity, `canViewProfile`-style checks already in the codebase) rather
than a parallel data-access layer. Widening endpoint coverage later means
adding routes on top of this pattern, not inventing a new one.

## Build sequence

1. `DeveloperApp` + credentials + redirect URI allowlist (§3)
2. `OAuthScope` seed + `DeveloperAppScope` + sensitivity review gate (§4.1, §4.3)
3. OAuth2 authorization-code + PKCE flow (§4.2)
4. Public REST API core: bearer auth, versioning, representative endpoints (§5.1, §5.2)
5. Rate limiting + aggregated usage counters (§5.3)
6. Webhooks: subscriptions, HMAC-signed delivery, retry/backoff, auto-disable (§7)
7. Phase 9 apps upgrade path: `developer_app_id` + OAuth-triggering install (§8)
8. Developer dashboard under `/s/[username]/developer` (§9) + account-settings authorized-apps view (§4.4)
