# 0dot.in

**One Identity. One Profile. Infinite Possibilities.**

0dot.in is a digital identity platform: a permanent home on the internet that grows from a single `0dot.in/@username` profile into a full social feed, community spaces, and a business presence — all under one identity. This repo is the reference implementation, built in phases against the specs in [`docs/specs/`](docs/specs).

> Full long-range vision: [`docs/ROADMAP.md`](docs/ROADMAP.md) (16 phases, identity → social → communities → business → creator monetization → developer platform → AI → enterprise). This README covers what's actually built today: **Phases 1–16** (Phase 16's "Future Modules" list was triaged, not built module-for-module — see [its row below](#whats-built) and [`docs/specs/phase-16-future-modules.md`](docs/specs/phase-16-future-modules.md) §2 for what was in scope vs. deferred).

## What's built

| Phase | Area | Highlights |
|---|---|---|
| **1 — Foundation** | Identity | Auth (bcrypt + session cookies), `@username` claiming, profile (bio, avatar/cover, themes, social links), customizable link-in-bio with click analytics and scheduling, chronological feed, full-text search |
| **2 — Social** | Follow & messaging | Follow/unfollow, blocking, end-to-end-encrypted 1:1 and group DMs with live SSE delivery, message requests, a notification system with read-time aggregation, a time-decayed trending feed |
| **3 — Communities** | Spaces | Public/restricted/private communities, moderation (ban/mute/promote/transfer ownership), rules, discovery tags, post flair, a collaborative wiki with revision history, live per-community chat, walkie-talkie-style voice rooms, community-scoped polls and Q&A, staff analytics |
| **4 — Business** | Commerce presence | Business pages with a weak-signal claim/verification gate (auto-approve on domain match, otherwise a platform-admin review queue), team roles, business-authored posts, a products/services catalog with a storefront view, attributed reviews, a jobs board with applications, MVP appointment scheduling with transactional double-booking prevention, a document library, and search integration |
| **5 — Creator** | Monetization | A processor-agnostic payments backbone (`CreatorPayoutAccount` + `PaymentTransaction` ledger, stub processor — no live Stripe yet) underlying tips, paid membership tiers with gating, digital downloads, online courses, podcasts, a newsletter, affiliate links, and livestreams |
| **6 — Portfolio** | `/p/project` | Project portfolios, skills, resume, linked git repositories, credentials/certificates and awards |
| **7 — Knowledge** | Publishing | Articles, multi-chapter books, a personal wiki, and downloadable published files, with reactions, comments, and search integration |
| **8 — Events** | `/e/event` | Business- or community-hosted events (owner XOR), RSVP and ticketing |
| **9 — Marketplace** | `/m/` | Freelance services at `/[username]/services` (individual-seller extension of the Phase 4 `Offering`/`Appointment` model) plus a `MarketplaceListing` browse/search surface for apps, themes, templates, and digital products |
| **10 — Developer platform** | API & OAuth | `DeveloperApp` registration, scoped OAuth2/PKCE ("Sign in with 0dot"), a bearer-authed public REST API with rate limiting and usage counters, and HMAC-signed webhook delivery with retry/backoff |
| **11 — AI platform** | AI layered on existing surfaces | A shared `AIGeneration` usage-audit substrate every AI call logs through; AI moderation (`ModerationFlag` queue), AI content writer/profile builder, AI accessibility (alt-text/captions via `MediaAccessibilityMetadata`), AI-driven recommendations replacing Phase 2's placeholder "suggested users" heuristic, AI-assisted search, and AI translation (`ContentTranslation`) — no live model provider wired in, `ai-provider.ts` is the swappable seam |
| **12 — Trust & safety** | Moderation & review | Unified `TrustSafetyCase` case management across every surface that previously had ad hoc review (community, business, marketplace, OAuth scopes, AI flags), a `Report` center, `Appeal` workflow, spam/bot `AccountRiskSignal` detection, age controls, and transparency reporting |
| **13 — Copyright & IP** | Legal/compliance | `ContentRevision` version history for posts/articles, a full DMCA takedown/counter-notice workflow (`DMCATakedownNotice`/`DMCACounterNotice`), copyright declarations, watermarking, `ContentLicense` ownership records, 0dot brand trademark protection, and generalized `JurisdictionRule`-driven jurisdiction rules |
| **14 — Enterprise** | Organizations | `Organization` (distinct from `Business`), team management via `OrganizationMember`, internal communities (`Community.restrictedToOrganizationId`), SAML2/OIDC single sign-on (`SSOConnection`/`SSOIdentity`) with JIT provisioning, an employee directory, and `OrganizationAuditLog` reusing Phase 3's `ModAction` shape |
| **15 — Mobile apps** | PWA & first-party clients | 0dot's own apps as real OAuth clients of the Phase 10 API (no privileged internal-only path), a PWA (`manifest.json`, service worker, install prompt), web push notifications as a third delivery channel alongside in-app/email, in-app-purchase payout batching (`IapPayoutBatch`), and digital business cards (`DigitalBusinessCard`) as a `.well-known`/vCard-style share surface |
| **16 — Future modules** | Triaged reuse, not a rebuild | Of the roadmap's 16 unscheduled "Future Modules," Podcasts/Polling/Newsletters were already built in earlier phases (not duplicated); Job board resolves a deferral named back in Phase 4; Notes, Calendar, Maps, Donations, and Learning platform are thin new layers over existing entities; URL shortener (`ShortLink`), Forms & Surveys (`Form`), and a lightweight CRM (`Contact`/`Activity`) are genuinely new but modest; Cloud storage and Video hosting were scope-warned/flagged as open questions in the spec and were **not built** — see [`docs/specs/phase-16-future-modules.md`](docs/specs/phase-16-future-modules.md) §2 for the full triage table |

Everything above is server-rendered, permission-checked server-side (never just hidden in the UI), and covered by the specs in `docs/specs/phase-{1..16}-*.md`.

### Known gaps

This is an actively developed reference build, not a finished product. See [`BUGS.md`](BUGS.md) for the current open-findings list from an internal code review (mostly Phase 1–4 feed-visibility filtering edge cases, tracked as fixed/open per item) and [`docs/foundations/ENGINEERING_ARCHITECTURE.md`](docs/foundations/ENGINEERING_ARCHITECTURE.md) for architectural decisions and their tradeoffs (e.g. SQLite as a conscious pre-scale choice, stub payment processor, no CDN/media pipeline).

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Turbopack, Server Actions) + **React 19**, TypeScript throughout
- **[Prisma 7](https://www.prisma.io)** + **SQLite** (`@prisma/adapter-better-sqlite3`) — 148 models spanning identity, social, community, business, creator monetization, portfolio, knowledge, events, marketplace, developer-platform, AI, trust & safety, copyright/IP, enterprise, mobile/PWA, and CRM/short-link/forms/calendar domains
- **Server Components by default**; client components only at real interactivity boundaries (`useActionState` forms, live SSE consumers)
- No external services required to run locally — auth, sessions, encryption, and file storage are all self-contained (see [Known gaps](#known-gaps) for what that trades off)

## Getting started

**Requirements:** Node.js 20+, npm.

```bash
git clone git@github.com:kingofyadav/0dot.git
cd 0dot
npm install
```

Create a `.env` file:

```bash
DATABASE_URL="file:./dev.db"

# 256-bit key, base64-encoded — encrypts direct-message content at rest.
# Generate a fresh one per environment; never reuse a dev key in production.
MESSAGE_ENCRYPTION_KEY="<run: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\">"
```

Apply the schema and start the dev server:

```bash
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signup sends a verification link — in local dev, without `SMTP_HOST` set, `src/lib/email.ts` falls back to a console-log stub and the link is also surfaced directly on the "check your email" page. Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM` (any SMTP relay — SES, Postmark, Mailgun, Resend's SMTP endpoint, a self-hosted MTA) and `APP_ORIGIN` before launch so real email goes out instead.

### Other useful commands

```bash
npx tsc --noEmit     # typecheck
npm run lint         # ESLint
npx prisma generate  # regenerate the Prisma client after a schema change
npm run build        # production build
```

## Project structure

```
src/
  app/                # routes (App Router) — pages, layouts, Server Actions, SSE route handlers
    actions/           # "use server" mutations, grouped by domain (posts, follow, communities, businesses, ...)
    b/, c/, s/, p/, e/, m/  # business (/b), community (/c), creator (/s), portfolio (/p), event (/e), marketplace (/m) route trees
    org/, sso/, trust-safety/, dmca/  # enterprise, SSO, trust & safety, and copyright/IP surfaces
    form/, fund/, map/, l/, jobs/     # Phase 16: forms, donations/fundraising, maps, short-link redirects, job board
    oauth/, api/            # OAuth2/PKCE authorization flow and the public REST API
    .well-known/            # digital business card discovery (Phase 15)
  components/          # shared React components (PostCard, MessagingProvider, ...)
  lib/                  # server-only domain logic — query builders, permission checks, notifications, crypto
  generated/prisma/     # generated Prisma client (gitignored)
prisma/
  schema.prisma         # single source of truth for the data model
  migrations/            # one migration per schema change, applied in order
docs/
  specs/                 # phase-by-phase product specs (the actual requirements each phase was built against)
  foundations/            # living architecture/engineering-decision docs
  ROADMAP.md               # the full 16-phase vision
```

## Contributing / working in this repo

If you're using an AI coding agent here, read [`AGENTS.md`](AGENTS.md) first — this project pins specific framework versions with breaking changes from what most training data assumes (async `cookies()`/`params`, `proxy.ts` instead of `middleware.ts`, Server Actions patterns). Check `node_modules/next/dist/docs/` before assuming an older Next.js convention applies.

---

Private project — see `package.json`. Not currently licensed for external reuse.
