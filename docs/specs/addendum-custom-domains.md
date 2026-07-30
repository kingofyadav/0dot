# Addendum — Custom Domains (Full Spec)

Status: Draft
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md), [roadmap-audit.md](roadmap-audit.md),
[addendum-platform-billing.md](addendum-platform-billing.md), [addendum-premium-profiles.md](addendum-premium-profiles.md),
[phase-1-foundation.md](phase-1-foundation.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-14-enterprise.md](phase-14-enterprise.md)

## 1. Purpose & Scope

Lets a personal profile or business page serve its public content from a
domain the owner controls (`yourname.com`) in addition to its permanent
`0dot.in/@handle` or `0dot.in/b/business` URL — which must never stop
working, per Phase 1 §3.5's permanence guarantee. This full pass revises
one design call the condensed treatment in
[addendum-platform-billing.md](addendum-platform-billing.md) §3 made too
quickly (§3 below), and works through domain takeover prevention, SSL
lifecycle, and cross-domain session handling in the depth a real
implementation needs.

**In scope:** domain claiming and ownership/routing verification; SSL
provisioning and renewal; content serving and canonical-URL behavior across
both the custom domain and `0dot.in`; billing-gated activation and
non-destructive lapse handling.
**Out of scope:** authenticated/interactive sessions (liking, commenting,
following) working natively on the custom domain — deliberately a
read-only presentation layer, with interactive actions bouncing to the
canonical `0dot.in` URL (§6); a custom domain for `Organization` itself,
which has no public page of its own to serve (§2.2).

## 2. Who can have one

### 2.1 Profile and Business, not Organization

```
CustomDomain
  id                       uuid, pk
  owner_type                enum: profile | business
  owner_profile_id            uuid, fk -> Profile, nullable
  owner_business_id             uuid, fk -> Business, nullable
  -- exactly one owner_* set — a two-way XOR, not the three-way width used
  -- for PlatformSubscription in the billing addendum (see §2.2 for why)
  domain                          string, unique
  is_apex                            boolean  -- root domain (acme.com) vs. subdomain (links.acme.com) — affects which DNS record type is required, see §4.2
  dns_target                          string  -- a per-domain-unique target 0dot issues, never user-supplied — see §5 for why uniqueness is load-bearing
  routing_status                        enum: pending_dns | routing_verified | routing_failed
  ssl_status                              enum: pending | active | renewal_failed
  is_primary                                boolean, default false
  status                                      enum: active | suspended_nonpayment | dormant | removed
  claimed_at                                    timestamp
  claim_expires_at                                timestamp  -- see §5.3
  last_health_check_at                              timestamp, nullable
  created_at                                          timestamp
```

### 2.2 Correcting the addendum's three-way assumption

The billing addendum's §3 gave `CustomDomain` the same three-way owner
width as `PlatformSubscription` (`profile | business | organization`)
without checking whether that width actually fits — it doesn't. Phase 14
§2.1 designed `Organization` as a company's internal control plane (SSO,
audit logs, directory), explicitly **not** a public-facing page; it can
optionally link to a `Business` that does have one (`Organization.
business_id`). An organization wanting its linked business's page on a
custom domain already has that path — through the `Business` it's linked
to, via `owner_business_id` — with no separate organization-specific case
needed. This is corrected here to a two-way XOR, matching actual
cardinality rather than mechanically copying a sibling table's width. If
Phase 14's admin console ever grows a public-facing surface that itself
needs a custom domain, that's a deliberate future addition, not assumed
necessary now.

### 2.3 Acceptance criteria

- [ ] `CustomDomain` has exactly one of `owner_profile_id`/`owner_business_id`
      set — never both, never neither, never an organization directly.

## 3. Revising the addendum's shared-verification-mechanism call

The billing addendum's §3.2 proposed one shared `DomainVerification`
primitive (a DNS TXT record) for both this feature and Phase 14's SSO
domain check. Working through the actual mechanics in full surfaces that
this was the wrong call, and it's worth saying so plainly rather than
quietly repeating it:

- Phase 14's SSO domain verification has **no routing step at all** — an
  organization's email keeps flowing through its own mail infrastructure
  unchanged; a DNS TXT record is the *only* sensible mechanism, and it
  remains exactly as Phase 14 §2.2 specified, untouched by this document.
- Custom domain hosting **requires** the owner to point DNS at 0dot's
  infrastructure for the feature to function at all. Once that CNAME/A
  record resolves correctly to the target 0dot issued, that resolution
  *is* the ownership proof — if you can change a domain's authoritative
  DNS, you control it. A separate, redundant TXT-record step before
  allowing that CNAME setup would either force hosting through an extra
  manual step no comparable product requires, or force SSO verification
  through a routing mechanism its use case has no reason to need.

These are genuinely different problems wearing the same word ("domain
verification"). Forcing them through one shared table would have made
this feature's implementation worse to save a small, illusory amount of
duplication. Phase 14's domain verification is unaffected by this
document; this feature gets its own combined ownership-and-routing
mechanism, below.

## 4. Claiming and verifying a domain

### 4.1 The claim step

Creating a `CustomDomain` row issues a **per-domain-unique** `dns_target`
(e.g. `<random-token>.edge.0dot.in`) immediately — before any DNS has been
verified — so the owner has something concrete to point their domain at.
`routing_status` starts `pending_dns`.

### 4.2 Apex vs. subdomain, and a real DNS limitation worth naming

A subdomain (`links.acme.com`) points via a standard CNAME record — the
common case, works with any DNS provider. An apex/root domain
(`acme.com`) **cannot** use a CNAME per the DNS specification, and needs
either an ALIAS/ANAME record (a non-standard pseudo-record some DNS
providers support and some don't) or a set of A records pointing at 0dot's
edge IPs. This is a genuine, provider-dependent limitation — some owners
using a DNS provider without ALIAS/ANAME support may only be able to use a
subdomain, not their bare root domain. Worth surfacing to the owner during
setup rather than assuming every domain configuration is equally
straightforward.

### 4.3 Verification is routing verification, and it's time-limited

0dot polls until `dns_target` resolves correctly for the claimed domain,
at which point `routing_status` becomes `routing_verified` — the single
step doing double duty as both ownership proof and routing setup, per §3.
If verification hasn't succeeded within a grace window (e.g. 7 days,
confirmed with product in §9) from `claimed_at`, the claim expires
(`claim_expires_at`) and the row is released — the domain string becomes
claimable again by any user. Without this expiry, a user could claim a
domain string they don't actually control (never pointing real DNS at it)
and squat on it in 0dot's own database indefinitely, blocking its
legitimate owner from claiming it later even though the squatter never
served a single request from it.

### 4.4 Acceptance criteria

- [ ] `dns_target` is generated fresh and unique per `CustomDomain` row,
      never a shared value across multiple owners.
- [ ] An unverified claim past `claim_expires_at` is released, and the
      domain string becomes claimable by a different user.
- [ ] Apex-domain claims surface the ALIAS/ANAME-or-A-record requirement
      to the owner rather than presenting identical instructions to a
      subdomain claim.

## 5. Domain takeover — a named, well-documented vulnerability class

### 5.1 Why this gets its own section, not a bullet in "Security"

"Subdomain/domain takeover via dangling DNS records" is a well-documented
vulnerability class that has affected many real SaaS custom-domain
features: a domain's DNS still points at a platform's shared
infrastructure after the platform-side record backing it is deleted,
letting a different tenant claim that dangling target and serve their own
content at someone else's domain. This deserves the same explicit,
by-name treatment this series has given other serious, specifically-named
risks (SAML signature-wrapping in Phase 14 §5.4, CSAM mandatory reporting
in Phase 11 §4.2) rather than a generic "be careful with domains" note.

### 5.2 The mitigation is per-tenant target uniqueness, never reused

Because `dns_target` (§4.1) is unique per `CustomDomain` row and **never
reused or recycled**, even after a row is deleted, a stale DNS record
still pointing at an old, now-orphaned target simply resolves to nothing —
it isn't silently reassignable to a new claimant, because no new claimant
is ever issued that same target string. This is the standard, correct
defense against this vulnerability class, and it only works if target
reuse is genuinely never allowed, not just unlikely.

### 5.3 Deletion and dormancy, not immediate release

When an owner removes a `CustomDomain` (or a lapsed subscription's grace
period runs out, per §7.3), the row transitions to `dormant` rather than
being deleted immediately — the domain string stays reserved to its
original owner for a retention period (e.g. 90 days, flagged in §9) before
the row is fully removed and the string becomes claimable again. This
prevents a narrower but related race: someone else attempting to claim the
exact domain string in the window immediately after removal, before the
original owner has necessarily removed their own DNS records pointing at
the (now-orphaned, per §5.2, harmless) old target.

### 5.4 A side benefit worth naming: this is stronger than Phase 4's claim gate

Phase 4 §3.3's business-claim gate checks a *name string*, which is
inherently spoofable by anyone willing to pick a similar name. This
feature's ownership check requires actually controlling the domain's
authoritative DNS — a materially stronger guarantee against impersonation
than a name-based claim. Worth noting as a genuine strength of this
design, not just an absence of new risk.

### 5.5 Acceptance criteria

- [ ] No `dns_target` value is ever assigned to more than one `CustomDomain`
      row over the system's lifetime, including across deleted rows.
- [ ] A removed or lapsed `CustomDomain` transitions to `dormant`, not
      immediate deletion, and the domain string is not claimable by another
      user during the dormancy window.

## 6. Content serving: read-only presentation, full path mirroring

### 6.1 Every path under the identity, not just the landing page

`yourname.com/*` mirrors `0dot.in/@handle/*` in full — articles, projects,
link-click redirects, everything addressable under the profile (or
`acme.com/*` mirroring `0dot.in/b/business/*` for a business) — not just a
root landing page. Internal link generation must be host-aware (rendering
relative paths, or checking the request's Host header) so visitors
browsing via the custom domain aren't unexpectedly bounced back to
`0dot.in` mid-navigation.

### 6.2 Deliberately read-only — no cross-domain session

A logged-in visitor's session cookie for `0dot.in` does not, and by
ordinary browser cookie scoping cannot, automatically apply on
`yourname.com` — a genuinely different origin. Making authenticated
actions (liking, commenting, following) work natively on a custom domain
would require a cross-domain SSO-style bounce-and-token-exchange, real
engineering complexity disproportionate to what this feature is actually
for. **Deliberate scope decision: custom domains serve public, read-only
content only.** Any interactive action available on a piece of content
deep-links back to that content's canonical `0dot.in` (or `0dot.in/b/...`)
URL, where the visitor's ordinary session applies normally.

### 6.3 Canonical URL and SEO — preference, never replacement

A `rel="canonical"` tag points at whichever URL the owner prefers (the
custom domain if `is_primary` and active, otherwise `0dot.in`) — this is
an SEO preference signal, **never** a hard redirect that retires the
`0dot.in` URL. That URL must remain independently resolvable regardless of
custom-domain status, per Phase 1 §3.5 — a custom domain is an alternate
presentation layer over the same permanent identity, not a replacement for
it.

### 6.4 Acceptance criteria

- [ ] Every public path reachable at `0dot.in/@handle/...` (or
      `0dot.in/b/business/...`) is also reachable at the equivalent path on
      an active custom domain.
- [ ] Clicking an interactive action while browsing via a custom domain
      lands the visitor on the canonical `0dot.in` URL for that content, not
      a broken or silently-failing in-place action.
- [ ] `0dot.in/@handle` (or `/b/business`) resolves correctly regardless of
      whether a custom domain is active, suspended, or removed for that
      owner.

## 7. SSL/TLS

### 7.1 Automatic provisioning and renewal

Once `routing_status = routing_verified`, a certificate is provisioned
automatically via ACME (e.g. Let's Encrypt), typically an HTTP-01
challenge for subdomains (0dot's edge, now receiving traffic for that
hostname, can serve the challenge file directly) or DNS-01 for apex/
wildcard cases. Renewal runs automatically ahead of expiry (e.g. 30 days
out); a failure retries a bounded number of times before `ssl_status`
becomes `renewal_failed` and the owner is notified — the domain falls back
to not serving rather than presenting a broken or expired certificate,
which browsers would block or warn on regardless.

### 7.2 Acceptance criteria

- [ ] No custom domain serves content over a failed or expired
      certificate — a renewal failure stops serving rather than degrading
      to an insecure or browser-blocked state.
- [ ] `ssl_status = renewal_failed` notifies the domain's owner, not just a
      silent internal log entry.

## 8. Billing gate and non-destructive lapse handling

### 8.1 Activation requires an active PlatformSubscription

A `CustomDomain` cannot reach `status = active` without an active,
appropriately-scoped `PlatformSubscription` (§2 of
[addendum-platform-billing.md](addendum-platform-billing.md)) —
`profile_premium` for a `Profile`-owned domain, `business_subscription`
for a `Business`-owned one. For a `Business`, only `owner`/`admin`
`BusinessMember` roles (Phase 4 §4.1) may add or remove a custom domain —
reusing that phase's existing permission model rather than a new one.

### 8.2 Lapse is a graceful, non-destructive sequence, not an on/off switch

Consistent with this series' general bias toward non-destructive state
transitions (Phase 12 §8.2's protective-not-punitive age-verification
default, Phase 14 §4.2's offboarding that revokes access without touching
content): a `PlatformSubscription` lapsing does not immediately stop
routing. Sequence:
1. **Grace period** (e.g. 14 days, confirmed in §9): content keeps serving
   normally, absorbing a payment hiccup without an abrupt outage.
2. **`suspended_nonpayment`**: routing stops (visitors get an error, not
   0dot's content) if the grace period elapses without resolution — but
   the row and its `dns_target` are retained, not released.
3. **`dormant`** (§5.3): after a longer retention window (e.g. 90 days)
   with no resumption, matching the general dormancy handling already
   specified for removed domains.

### 8.3 Acceptance criteria

- [ ] A `PlatformSubscription` lapse does not immediately stop a custom
      domain from serving — the grace period in §8.2 applies first.
- [ ] Only `owner`/`admin` `BusinessMember` roles can manage a
      business-owned `CustomDomain`.

## 9. Explicit open questions for product/finance sign-off

- **Claim expiry window** (§4.3): 7 days proposed, not confirmed.
- **Nonpayment grace period and dormancy retention window** (§8.2): 14 and
  90 days proposed as reasonable starting points, not confirmed.
- **Domains included per plan**: how many `CustomDomain`s come bundled with
  a `profile_premium`/`business_subscription` plan, and pricing for
  additional ones beyond that — a finance decision, tied to
  [addendum-premium-profiles.md](addendum-premium-profiles.md).
- **Apex-domain support at launch**: is subdomain-only acceptable for an
  initial release, deferring full ALIAS/ANAME/A-record apex support, given
  the provider-dependent limitation in §4.2?
- **Branding on custom-domain-served pages**: does an active custom domain
  hide any "powered by 0dot" branding shown on the default `0dot.in` URL —
  a product/marketing decision, not assumed either way here.

## 10. Suggested build sequence

1. `CustomDomain` claim flow + per-tenant-unique `dns_target` issuance +
   routing-verification polling (§4) — the foundational claim-and-verify
   loop.
2. Domain takeover hardening: target non-reuse, claim expiry, dormancy
   handling (§5) — sequence immediately after step 1, not as a later
   hardening pass, given the seriousness of the vulnerability class it
   closes.
3. SSL/ACME provisioning, renewal, and failure fallback (§7) — depends on
   step 1's routing verification succeeding first.
4. Full path-mirroring content serving + host-aware link generation +
   canonical-URL handling (§6) — the actual value delivery once steps 1–3
   work.
5. Billing gate + non-destructive lapse sequence (§8) — depends on
   [addendum-platform-billing.md](addendum-platform-billing.md) §2
   existing; sequence once that table is available, not before.
6. Notification producers (`custom_domain_routing_failed`,
   `custom_domain_ssl_renewal_failed`, `custom_domain_suspended_nonpayment`)
   — sequence after the states they describe (steps 1–5) exist.
