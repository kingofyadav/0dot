# 0dot.in — Complete Product Roadmap (Vision 2030)

## Mission

**Build the world's digital identity platform** where every person, creator, business, organization, and community has a permanent, secure, and customizable home on the internet.

**Tagline:**

> **One Identity. One Profile. Infinite Possibilities.**

---

## Build status (as of 2026-08-27)

This document is **both** the long-range vision **and** a status ledger. The
phase sections below list the *target* feature set for each phase — the
aspiration, unchanged since it was written. This table records what has
actually shipped against each one. When the two disagree, the phase spec in
`docs/specs/phase-N-*.md` and `README.md`'s "What's built" table are the
authoritative account of the real implementation; the phase bullets here are
kept as the original intent, not edited down to match reality.

Status legend: **Shipped** — built, server-checked, spec-covered, live in the
codebase · **Shipped (partial)** — core is live, named gaps remain (see Notes)
· **Planned** — has a spec, not built · **Not built** — deliberately deferred.

| Phase | Area | Status | Notes / known gaps |
|---|---|---|---|
| **1** | Foundation (identity, links, feed, search) | **Shipped (partial)** | Link ordering is up/down buttons, not drag-and-drop (Phase 1 follow-up, not a new phase). Feed now has cursor pagination + "Load more" (`feed-query.ts`/`FeedList.tsx`). Search is Prisma `contains` in `src/lib/search.ts` — no relevance ranking / fuzzy matching. |
| **2** | Social (follow, messaging, notifications, trending) | **Shipped** | E2E-encrypted 1:1 + group DMs with SSE delivery, message requests, read-time-aggregated notifications, time-decayed trending feed. |
| **3** | Communities | **Shipped** | Public/restricted/private, full mod tools (ban/mute/promote/transfer), wiki with revisions, live chat, voice rooms, polls, Q&A, staff analytics. |
| **4** | Business platform | **Shipped** | Weak-signal claim gate (auto-approve on domain match, else `/admin` review queue), catalog + storefront, attributed reviews, jobs board, MVP appointments with double-booking prevention, document library. |
| **5** | Creator platform | **Shipped** | Processor-agnostic payments backbone behind `PaymentProcessor`, now backed by **live Stripe Connect (Accounts v2)**. Tips, membership tiers, digital downloads, courses, podcasts, newsletter, affiliate links, livestreams (real LiveKit video when `LIVEKIT_*` set, else scheduling/chat stub). |
| **6** | Portfolio (`/p/`) | **Shipped** | Projects, skills, resume, linked git repos, credentials/certificates, awards; rendered inline on the profile ordered by `portfolioLayoutJson`. |
| **7** | Knowledge | **Shipped** | Articles, multi-chapter books, personal wiki, downloadable published files, with reactions/comments/search. Not surfaced as a profile-page section — own route trees (see `INFORMATION_ARCHITECTURE.md`). |
| **8** | Events (`/e/`) | **Shipped** | Business- **or** community-hosted (owner XOR), RSVP, ticketing (on the Phase 5 payments backbone). |
| **9** | Marketplace (`/m/`) | **Shipped** | Freelance services at `/[username]/services` (individual-seller extension of Phase 4 `Offering`/`Appointment`) + a `MarketplaceListing` browse/search surface. Roadmap's `/store` name shipped as `/m` — see Platform URLs note below. |
| **10** | Developer platform | **Shipped (partial)** | `DeveloperApp` registration, scoped OAuth2/PKCE ("Sign in with 0dot"), bearer-authed public REST API (`/api`) with rate limiting + usage counters, HMAC-signed webhooks with retry/backoff. **Not built:** GraphQL API, published SDKs — REST + OAuth only. `/developers` is not a standalone route; app management is under `/s/{username}/developer`. |
| **11** | AI platform | **Shipped** | Shared `AIGeneration` usage-audit substrate; moderation queue (`ModerationFlag`), content writer / profile builder, alt-text/captions (`MediaAccessibilityMetadata`), AI recommendations replacing Phase 2's placeholder heuristic, AI-assisted search, translation (`ContentTranslation`). Backed by **live Claude** (`@anthropic-ai/sdk`) via `ai-provider.ts` when `ANTHROPIC_API_KEY` is set; deterministic local stub otherwise (always in tests/CI). |
| **12** | Trust & safety | **Shipped (partial)** | Unified `TrustSafetyCase` across all review surfaces, `Report` center, `Appeal` workflow, `AccountRiskSignal` spam/bot detection, age controls, transparency reporting. Session-management UI (`/s/{username}/security/sessions`), 2FA (`/login/2fa` + `/s/{username}/two-factor`), email/phone change, and account deactivation/deletion (`account-lifecycle.ts`, `/api/v1/account/lifecycle/delete`) are **now built** — the gaps earlier revisions flagged are closed. Remaining: privacy controls are still binary (`Profile.isPrivate`), no granular per-post visibility or messaging/mention permission model. |
| **13** | Copyright & IP | **Shipped** | `ContentRevision` version history, full DMCA takedown/counter-notice workflow, copyright declarations, watermarking, `ContentLicense` ownership records, 0dot brand trademark protection, `JurisdictionRule`-driven rules. |
| **14** | Enterprise | **Shipped** | `Organization` (distinct from `Business`), `OrganizationMember` team management, internal communities (`Community.restrictedToOrganizationId`), SAML2/OIDC SSO (`SSOConnection`/`SSOIdentity`) with JIT provisioning, employee directory, `OrganizationAuditLog`. |
| **15** | Mobile apps | **Shipped (partial)** | PWA (`manifest.json`, service worker, install prompt), web push as a third delivery channel, IAP payout batching (`IapPayoutBatch`), digital business cards (`DigitalBusinessCard`, `.well-known`/vCard). Native Expo app (`mobile/`) is a real OAuth2/PKCE client of the Phase 10 API — see `docs/foundations/MOBILE.md` for its parity status. **Not built:** a dedicated desktop app (PWA covers "desktop app" for now). |
| **16** | Future modules | **Shipped (triaged)** | Not a module-for-module rebuild. Podcasts/Polling/Newsletters were already built earlier (not duplicated); Job board resolves a Phase 4 deferral; Notes/Calendar/Maps/Donations/Learning are thin layers over existing entities; URL shortener (`ShortLink`), Forms & Surveys (`Form`), lightweight CRM (`Contact`/`Activity`) are genuinely new but modest. **Not built:** Cloud storage, Video hosting — scope-warned in the spec (`phase-16-future-modules.md` §2). |

**Cross-cutting addenda** (features spanning phases, specced in `docs/specs/addendum-*.md`), all **Shipped**:
account-settings hardening, platform billing (direct-to-platform SaaS charges via Stripe Billing — the payment topology `roadmap-audit.md` §2.2 flagged as missing), custom domains, premium profiles, coin wallet, mobile pro-upgrade (M1–M14). The gaps in `docs/specs/roadmap-audit.md` §2 (custom domains, premium profiles, API-usage billing, trending, general accessibility) are all now resolved — each has an addendum spec and a live implementation.

**One integration still stubbed:** SMS (`src/lib/sms.ts`) — no provider wired, not used by any live feature. Everything else (Stripe, Claude, Resend, Vercel Blob, LiveKit) is real when its credentials are set. See `README.md`'s Integrations table.

---

# Phase 1 — Foundation (MVP)

Status: **Shipped (partial)** — see the table above and `docs/specs/phase-1-foundation.md`.

## Identity

* `0dot.in/@username`
* Secure signup/login
* Username reservation
* Profile photo & cover
* Bio
* Social links
* Custom profile theme
* QR code

## Links

* Unlimited links
* Drag-and-drop ordering
* Link analytics
* Scheduled links
* Featured links

## Feed

* Home feed
* Create text/image/video posts
* Like, comment, repost, bookmark
* Hashtags
* Mentions

## Search

* Users
* Communities
* Posts
* Businesses

---

# Phase 2 — Social Platform

Status: **Shipped** — see `docs/specs/phase-2-social-platform.md`.

## Follow System

* Followers
* Following
* Verified creators
* Suggested users

## Messaging

* Direct messages
* Group chats
* File sharing
* Voice notes

## Notifications

* Likes
* Comments
* Mentions
* Messages
* Community updates

---

# Phase 3 — Communities

Status: **Shipped** — see `docs/specs/phase-3-communities.md`.

```
0dot.in/c/community
```

Features:

* Moderators
* Rules
* Tags
* Wiki
* Events
* Polls
* Q&A
* Live chat
* Voice rooms
* Community analytics

---

# Phase 4 — Business Platform

Status: **Shipped** — see `docs/specs/phase-4-business-platform.md`.

```
0dot.in/b/business
```

Business profile includes:

* Company page
* Products
* Services
* Jobs
* Team
* Reviews
* Contact
* Store
* Documents
* Appointments

---

# Phase 5 — Creator Platform

Status: **Shipped** (live Stripe Connect) — see `docs/specs/phase-5-creator-platform.md`.

Creators get:

* Memberships
* Paid subscriptions
* Digital downloads
* Tips
* Affiliate links
* Livestreams
* Podcasts
* Newsletter
* Online courses

---

# Phase 6 — Portfolio

Status: **Shipped** — see `docs/specs/phase-6-portfolio.md`.

```
0dot.in/p/project
```

Support:

* Portfolio
* Resume
* Skills
* Git repositories
* Research papers
* Certificates
* Awards

---

# Phase 7 — Knowledge

Status: **Shipped** — see `docs/specs/phase-7-knowledge.md`.

Users can publish:

* Articles
* Documentation
* Tutorials
* Notes
* Wikis
* Books
* PDFs

---

# Phase 8 — Events

Status: **Shipped** — see `docs/specs/phase-8-events.md`.

```
0dot.in/e/event
```

Support:

* Conferences
* Meetups
* Tickets
* RSVP
* Live streaming
* Recordings

---

# Phase 9 — Marketplace

Status: **Shipped** (as `/m`, not `/store`) — see `docs/specs/phase-9-marketplace.md`.

Sell:

* Apps
* Themes
* Templates
* Courses
* Digital products
* Freelance services

---

# Phase 10 — Developer Platform

Status: **Shipped (partial)** — REST + OAuth only, no GraphQL or published SDKs. See `docs/specs/phase-10-developer-platform.md`.

Provide:

* Public API
* OAuth ("Sign in with 0dot")
* SDKs
* Webhooks
* GraphQL API
* Developer dashboard

---

# Phase 11 — AI Platform

Status: **Shipped** (live Claude via `ai-provider.ts`) — see `docs/specs/phase-11-ai-platform.md`.

AI features:

* AI profile builder
* AI content writer
* AI moderation
* AI recommendations
* AI search
* AI translation
* AI accessibility

---

# Phase 12 — Trust & Safety

Status: **Shipped (partial)** — session/2FA/account-deletion gaps now closed; privacy model still binary. See `docs/specs/phase-12-trust-safety.md` and `docs/foundations/TRUST_SAFETY.md`.

Build:

* Report center
* Appeals
* Spam detection
* Bot detection
* Community moderation
* Age controls
* Transparency reports

---

# Phase 13 — Copyright & IP

Status: **Shipped** — see `docs/specs/phase-13-copyright-ip.md`.

Implement:

* Automatic publication timestamps
* Version history
* Copyright declaration on content
* DMCA notice and counter-notice workflow (where applicable)
* Copyright reporting tools
* Watermarking options
* Content ownership records
* Trademark protection for the **0dot.in** brand
* Compliance with applicable laws in each country

---

# Phase 14 — Enterprise

Status: **Shipped** — see `docs/specs/phase-14-enterprise.md`.

Support:

* Organization accounts
* Team management
* Internal communities
* Employee directories
* Single Sign-On (SSO)
* Audit logs

---

# Phase 15 — Mobile Apps

Status: **Shipped (partial)** — PWA + native Expo app live; no dedicated desktop app. See `docs/specs/phase-15-mobile-apps.md`, `docs/specs/addendum-mobile-pro-upgrade.md`, and `docs/foundations/MOBILE.md`.

* Android
* iOS
* Tablets
* Desktop app
* Progressive Web App (PWA)

---

# Future Modules

Status: **Shipped (triaged)** — see Phase 16 row in the status table and `docs/specs/phase-16-future-modules.md` §2. Cloud storage and video hosting were **not built**.

* Digital business cards
* URL shortener
* Calendar
* Cloud storage
* Notes
* Forms
* Surveys
* Polling
* Podcasts
* Video hosting
* Maps
* Donations
* CRM
* Email newsletters
* Job board
* Learning platform

---

# Platform URLs

Status note: the sitemap below is the original target. `INFORMATION_ARCHITECTURE.md`
is the authoritative, code-synced map of what routes actually exist. Known
deltas: `/store` shipped as `/m`; `/settings` and `/developers` are not
standalone routes (both live under `/s/{username}`); `/blog`, `/help`, `/about`
are still Future.

```
0dot.in/@username
0dot.in/feed
0dot.in/explore
0dot.in/trending
0dot.in/c/community
0dot.in/b/business
0dot.in/p/project
0dot.in/e/event
0dot.in/jobs
0dot.in/store
0dot.in/blog
0dot.in/help
0dot.in/settings
0dot.in/api
0dot.in/developers
0dot.in/about
```

---

# Revenue Model

Status: infrastructure for every line below is **built** — premium profiles,
business subscriptions, and custom domains bill directly to the platform
(Stripe Billing, via the platform-billing addendum); creator subscriptions,
transaction fees, and marketplace commission run on the Phase 5 Stripe Connect
backbone; API usage has metering + a billing model (`roadmap-audit.md` §2.3
gap closed). Advertising and enterprise plans remain unbuilt by design (both
explicitly optional / later-stage).

* Free accounts
* Premium profiles
* Business subscriptions
* Custom domains
* Creator subscriptions
* Transaction fees
* Advertising (optional)
* Enterprise plans
* API usage
* Marketplace commission

---

# Core Principles

* User-first design
* Privacy by default
* Open APIs
* Secure by design
* Fast performance
* Accessibility
* Transparent moderation
* Respect for intellectual property
* Compliance with applicable laws
* Long-term, stable URLs

## Recommended build order

> **Superseded.** This 12-item list predates the full Phase 1–15 breakdown
> above and doesn't cover it (it never mentions Portfolio, Knowledge,
> Events, Marketplace, Trust & Safety, Copyright/IP, or Mobile Apps, and its
> ordering — e.g. "Search & discovery" as item 9 — doesn't match the
> Phase 1–15 sequence either). **The numbered Phase 1–15 structure above,
> together with each phase's own detailed spec in `docs/specs/` and that
> spec's "Suggested build sequence" section, is the authoritative build
> order.** Kept below for history, not as current guidance — see
> `docs/specs/roadmap-audit.md` for how this was identified.

1. Identity & profiles
2. Link hub
3. Feed & posting
4. Follow system
5. Communities
6. Messaging
7. Business profiles
8. Creator monetization
9. Search & discovery
10. Developer platform
11. AI features
12. Enterprise capabilities

This order lets you launch quickly with a useful product, then expand into the broader ecosystem you envision without overwhelming the initial development effort.
