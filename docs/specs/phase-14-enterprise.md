# Phase 14 — Enterprise Spec

Status: Draft
Owner: TBD
Related: [../ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md), [phase-3-communities.md](phase-3-communities.md), [phase-4-business-platform.md](phase-4-business-platform.md), [phase-10-developer-platform.md](phase-10-developer-platform.md), [phase-12-trust-safety.md](phase-12-trust-safety.md)

## 1. Purpose & Scope

Phase 14 gives a company organizational-level controls over its own
employees' presence on 0dot: organization accounts, team management,
internal communities, an employee directory, SSO, and audit logs. Phase 3
named this exact phase by number when it built `ModAction` ("a direct
precedent for Phase 14's audit logs requirement," §13.1 of that spec) — this
phase honors that by reusing the shape rather than inventing a fourth
audit-log pattern (§7). It also surfaces the single most consequential
design tension in this entire roadmap so far: **enterprise SSO, done
carelessly, can lock a person out of their own permanent identity the
moment they change jobs — directly contradicting the roadmap's own mission
of "One Identity. One Profile."** (§5.3).

**In scope:** a new `Organization` entity distinct from Phase 4's `Business`
(with an optional link between them); org-scoped team/employee management;
internal communities via an additive restriction on Phase 3's existing
`Community`; SAML2/OIDC single sign-on with the platform acting as service
provider (the reverse role from Phase 10's identity-provider work);
organization-scoped audit logs.
**Out of scope:** merging `Organization` and `Business` into one entity
(§2.1 — kept deliberately separate, with an optional link); a full billing/
pricing subsystem behind `Organization.plan` (handled elsewhere, not by
this spec).

## 2. Success Criteria

- A company can set up organizational controls (SSO, employee directory,
  internal communities, audit logs) without being required to first build
  out a public-facing Business page (Phase 4) it may not want.
- No employee's personal 0dot identity — years of posts, portfolio,
  purchases, social graph built entirely outside work — can be stranded
  behind their employer's IT department losing or revoking SSO access when
  they change jobs.
- Departing employees lose organization-scoped access (internal
  communities, SSO sessions) promptly on deactivation, without their
  personal account or content being touched.
- Enterprise audit logs reuse the exact append-only, actor-attributed shape
  Phase 3 named as this phase's precedent, rather than a new, subtly
  different pattern.

## 2.1 Organization is distinct from Business, by design

### 2.1 The fork, and why

`Business` (Phase 4) is a public-facing storefront/company-page concept —
products, reviews, jobs, appointments. `Organization` here is a company's
internal control plane over its own employees' accounts — SSO, audit logs,
internal communities. A company might want both, only one, or neither in
combination with the other. Rather than forcing every enterprise customer
through Phase 4's business-claim/public-page flow just to get SSO and audit
logs, `Organization` is a new, separate entity that can *optionally* link to
an existing `Business`:

```
Organization
  id                    uuid, pk
  name                  string, 1-100 chars
  business_id           uuid, fk -> Business, nullable  -- optional link if this company also has a public Business page
  domain                string, unique, nullable  -- verified email domain, e.g. "acme.com"
  domain_verified_at     timestamp, nullable
  plan                   enum: standard | enterprise
  created_by              uuid, fk -> User
  created_at               timestamp
```

### 2.2 Domain verification is another instance of the now-familiar gate pattern

Enabling SSO enforcement or email-domain-based employee auto-matching for
a domain requires that domain to be verified first (standard techniques —
a DNS TXT record or well-known file; exact mechanism is an implementation
detail, §8). This is at least the fifth instance of the "some gate must
exist before a capability goes live" pattern this series has built
repeatedly: Phase 4's business-claim gate (§3.3), Phase 9's marketplace
listing review (§4.5), Phase 10's sensitive OAuth scope review (§4.3), and
Phase 12's unified case-review system generally.

### 2.3 Acceptance criteria

- [ ] `Organization` can be created and used (team management, internal
      communities, audit logs) with `business_id` null — no dependency on
      Phase 4's business flow.
- [ ] SSO enforcement (§5) cannot be enabled for a domain that hasn't
      passed `domain_verified_at`.

## 3. Team management

### 3.1 A separate membership concept from BusinessMember

```
OrganizationMember
  organization_id   uuid, fk -> Organization
  user_id            uuid, fk -> User
  role                enum: org_admin | member
  department           string, nullable
  title                string, nullable
  status               enum: active | deactivated
  joined_at             timestamp
  primary key (organization_id, user_id)
```

Being an `OrganizationMember` does **not** automatically grant any
`BusinessMember` (Phase 4 §4.1) role on a linked `Business`, even when
`Organization.business_id` is set — "is an employee for HR/SSO/audit
purposes" and "can post as the company publicly" are different permission
questions (an accountant is an employee but shouldn't automatically gain
the ability to post as the company's public brand). Granting
`BusinessMember` access remains a separate, explicit action through Phase
4's existing flow.

### 3.2 Acceptance criteria

- [ ] Adding a user as an `OrganizationMember` grants no `BusinessMember`
      permissions on any linked `Business` — the two remain independently
      grantable.

## 4. Internal communities

### 4.1 An additive restriction on the existing Community entity, not a new one

```
Community (Phase 3) gains:
  restricted_to_organization_id   uuid, fk -> Organization, nullable
```

When set, community membership eligibility additionally requires an
`active` `OrganizationMember` row for that organization — layered on top
of, not replacing, Phase 3's existing public/private/restricted visibility
model (§3.1 of that spec) and its join/moderation machinery, which is
otherwise unchanged. This is at least the sixth instance of the
additive-scope-column idiom this series has used repeatedly —
`Post.community_id`/`business_author_id`/`required_tier_id` (Phases 3-5),
`Livestream`/`VoiceRoom.event_id` (Phase 8), `MarketplaceListing.
developer_app_id` (Phase 10) — reused again here rather than inventing a
new organizational-scoping mechanism.

### 4.2 Offboarding cascade

Deactivating an `OrganizationMember` (§3.1) must promptly remove them from
any `Community` restricted to that organization and revoke their SSO
sessions (§5) — a departing employee retaining "ghost" access to internal
resources is a real, easy-to-overlook security gap. This does **not**
extend to deleting or restricting their personal 0dot account, profile, or
any content built outside the organizational context — losing a job
removes organization-scoped access only, consistent with the mission
principle this phase is built around (§5.3).

### 4.3 Acceptance criteria

- [ ] A user without an `active` `OrganizationMember` row for a community's
      `restricted_to_organization_id` cannot join or view that community's
      content, regardless of the community's own visibility setting.
- [ ] Deactivating an `OrganizationMember` removes them from every
      org-restricted community within the same transaction/process that
      deactivates their membership — not as a separate, easily-forgotten
      step.
- [ ] Deactivation never touches the user's personal `Profile`, posts, or
      any content outside the organization's scope.

## 5. Single sign-on

### 5.1 The opposite role from Phase 10 — worth being explicit about

Phase 10 built 0dot as an OAuth2 **authorization server/identity provider**
for other applications ("Sign in with 0dot," Phase 10 §1). This phase's SSO
is the **reverse relationship**: 0dot becomes a **service provider** that
trusts an enterprise customer's own identity provider (Okta, Azure AD,
Google Workspace, etc.) via SAML 2.0 or OIDC, so a company's employees can
log into 0dot using their existing corporate credentials. These are
architecturally distinct roles that happen to share adjacent protocols
(OIDC appears on both sides) — conflating them would be a costly design
mistake, worth naming explicitly rather than assuming "we already built
OAuth in Phase 10" covers this.

```
SSOConnection
  id               uuid, pk
  organization_id   uuid, fk -> Organization, unique
  protocol           enum: saml2 | oidc
  idp_metadata        jsonb  -- SAML: IdP entity ID/certificate/metadata XML; OIDC: issuer URL/client credentials/JWKS endpoint
  enforced            boolean, default false
  created_at            timestamp

SSOIdentity
  id                    uuid, pk
  sso_connection_id      uuid, fk -> SSOConnection
  user_id                 uuid, fk -> User
  external_subject_id       string  -- the IdP's own subject/NameID for this person
  last_login_at             timestamp
  -- unique (sso_connection_id, external_subject_id)
```

### 5.2 Just-in-time provisioning, linking to the same permanent identity

A first-time SSO login for an email matching the organization's verified
domain either links to an **existing** 0dot account with that email, or
auto-provisions a new one (standard JIT provisioning) — going through the
same username-claim rules as any other signup (Phase 1 §3.2, no bypass).
Either way, the result is the person's one ordinary 0dot account and
profile, not a separate, walled-off "enterprise identity" — directly in
service of the roadmap's "One Identity, One Profile" mission.

### 5.3 The central risk of this entire phase: don't let SSO strand someone's identity

Forcing SSO-only login for an organization's employees creates a real risk
to the exact principle this whole roadmap is built on: if a user's *only*
authentication method becomes their employer's IdP, losing that job (and
the employer deactivating their corporate IdP account, which is entirely
outside 0dot's control) could lock them out of their own personal 0dot
identity — years of personal posts, portfolio, purchases, and social graph
built up entirely outside any work context. **Recommendation: `enforced`
should govern access to the organization-scoped context** (internal
communities, org admin functions, anything gated by `OrganizationMember`
status) **and should not fully disable the user's other login methods for
their underlying personal account.** A user should always retain at least
one non-employer-controlled path back into their own identity — their
original email/password, or a personal OAuth-linked identity from Phase 10.
This is flagged with the same seriousness this series has given other
genuinely load-bearing design decisions (Phase 8's recording consent,
Phase 11's CSAM pipeline) precisely because it's easy to build the
"obviously correct-looking" all-or-nothing enforcement toggle without
noticing the identity-stranding risk it creates.

### 5.4 Security review needed, not a routine integration

SAML 2.0 in particular has a well-documented history of subtle
implementation vulnerabilities (XML signature wrapping attacks among them)
— this needs dedicated security review before launch, not treatment as a
routine third-party integration. SSO-issued sessions should reuse the same
token-hashing/storage discipline already established for OAuth tokens
(Phase 10 §4.2), not a separately invented session mechanism.

### 5.5 Acceptance criteria

- [ ] `SSOConnection.enforced = true` requires SSO for accessing
      organization-scoped resources but does not remove the user's ability
      to authenticate into their personal account through a
      non-employer-controlled method.
- [ ] JIT provisioning creates or links exactly one `User`/`Profile` per
      person — never a separate identity from their existing personal
      account if one already exists with a matching verified email.
- [ ] SAML assertion validation is verified against signature-wrapping and
      related known attack classes as part of security review before
      launch.

## 6. Employee directory

An internal, org-scoped view over `OrganizationMember` and `Profile` data —
name, title, department, contact — visible only to fellow `active`
`OrganizationMember`s of the same organization, never public. This is
narrower than Phase 4's public-facing Team tab (§4.1 of that spec, which
uses a per-member `is_public` opt-in precisely because *some* business team
members want public listing while others don't) — an enterprise employee
directory has no public variant at all; that's the entire point of an
internal company directory, so no visibility toggle is needed.

### 6.1 Acceptance criteria

- [ ] No employee directory entry is visible to any user who is not an
      `active` `OrganizationMember` of the same organization — including
      users of a *different* organization (cross-tenant isolation).

## 7. Audit logs

### 7.1 Honoring Phase 3's named forward-reference

Phase 3 §13.1 explicitly said `ModAction`'s shape was "a direct precedent
for Phase 14's audit logs requirement." This phase follows through:

```
OrganizationAuditLog
  id                uuid, pk
  organization_id     uuid, fk -> Organization
  actor_id             uuid, fk -> User  -- or a system actor, e.g. an automated SSO-triggered deprovisioning event
  action                enum: member_added | member_removed | member_deactivated | sso_connection_configured | sso_enforcement_changed | community_created | org_settings_changed  -- illustrative, extensible
  target_type            string, nullable
  target_id              uuid, nullable
  metadata                jsonb, nullable
  created_at               timestamp
```

Same append-only, actor-attributed shape as `ModAction` (Phase 3 §13),
rather than a fourth subtly different audit-log pattern alongside it,
Phase 5/9's `PaymentTransaction` ledger, and Phase 12's `TrustSafetyCase`.

### 7.2 Same shape, deliberately different table — audience, not schema, is why

Despite reusing the shape, `OrganizationAuditLog` is kept as its own table,
not merged into `TrustSafetyCase`. The audiences are different: an
organization's own admins reviewing their own company's history, versus
0dot's Trust & Safety staff reviewing platform-wide enforcement. Merging
them would either give enterprise admins visibility into unrelated platform
moderation data, or swamp platform staff with every customer's routine
admin actions — reusing a pattern's *shape* doesn't imply the *table*
should be shared, a distinction worth stating since this series has
elsewhere generalized separate tables into one shared table (Phase 7 §4)
for a different, table-merging reason.

### 7.3 Retention is a go-to-market consideration, not just a technical one

Enterprise customers frequently require SOC 2 or similar certification as
a precondition of purchase, and audit log retention/immutability is a core
control area for that. Retention period should be designed around whatever
compliance framework 0dot is pursuing, since retrofitting audit logs to
satisfy a specific framework after the fact is materially more costly than
designing for it up front — flagged as a business decision this spec can't
resolve unilaterally (§8).

### 7.4 Acceptance criteria

- [ ] Every action in the `OrganizationAuditLog.action` enum produces
      exactly one log row, attributable to its actor.
- [ ] An organization's admins can only query their own organization's
      audit log — never another organization's, verified as a cross-tenant
      isolation check.

## 8. Cross-cutting concerns

### 8.1 Security and privacy

- Cross-tenant isolation is the dominant concern throughout this phase: no
  organization's admins, directory, or audit log is visible to another
  organization's members, verified explicitly rather than assumed from
  per-row scoping alone.
- SAML/OIDC implementation gets dedicated security review (§5.4), not
  routine-integration treatment.
- Organization admin console, directory, and audit-log UI meet the
  accessibility standing requirement from Phase 1 §7.3 — not restated in
  full per phase from here on.

### 8.2 Search

No new search surface — an internal, org-scoped directory lookup (finding a
colleague) is a narrow, org-scoped filtered query, not a platform-wide
search tab; consistent with keeping this phase's features properly
internal rather than bleeding into the platform's public discovery
surfaces (the same "explicitly none" assessment Phase 10 and most of Phase
12/13 made for their own admin/compliance-oriented work).

## 9. Explicit open questions for product/legal sign-off

- **SSO enforcement and personal-account access (§5.3)**: this is the
  central open question of the whole phase — confirm the recommendation
  that `enforced` never fully disables a user's non-employer-controlled
  path back into their own personal account.
- **Domain verification mechanism** (§2.2): DNS TXT record vs. well-known
  file vs. another standard method — an implementation detail, not fixed
  here.
- **SSO enforcement rollout/grace period**: can an organization phase in
  enforcement gradually, or is it all-or-nothing from a configured date?
- **Audit log retention period** (§7.3): tied to whichever compliance
  certification (e.g. SOC 2) 0dot pursues — a business decision, not
  resolved here.
- **Organization/Business relationship** (§2.1): confirm with product that
  keeping them separate (with an optional link) is correct, versus an
  expectation that Enterprise customers are assumed to already have a
  Business page.
- **Offboarding grace period**: should community/access removal on
  deactivation be immediate, or support a scheduled future offboarding
  date for planned departures?

## 10. Suggested build sequence within Phase 14

1. `Organization` + domain verification gate (§2) — foundational, and
   deliberately not dependent on Phase 4's `Business` existing.
2. `OrganizationMember` + role/status, kept independent of `BusinessMember`
   (§3) — team management.
3. `SSOConnection`/`SSOIdentity` (§5) — the largest new technical build in
   this phase; resolve the §5.3 identity-stranding question and complete
   the §5.4 security review before enabling enforcement for any real
   organization, not after.
4. Offboarding cascade: deactivation revokes SSO sessions and org-restricted
   community access without touching personal account/content (§4.2) —
   sequence immediately after steps 2–3 exist, since it depends on both.
5. `Community.restricted_to_organization_id` (§4.1) — a small additive
   change once steps 1–2 exist.
6. Employee directory (§6) — a view over existing data, low new-build cost.
7. `OrganizationAuditLog` (§7), reusing `ModAction`'s shape per Phase 3
   §13.1's named precedent — sequence after the actions it needs to log
   (steps 1–5) exist.
8. Notification producers (member added/removed, SSO configured) +
   `Notification.subject_type = organization` — sequence last, since these
   describe outcomes of the steps above.
