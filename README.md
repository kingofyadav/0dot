> [!NOTE]
> Private repository — see [License](#license). Shared here for reference, not currently open for external contribution.

# 0dot.in

**One Identity. One Profile. Infinite Possibilities.**

0dot.in is a digital identity platform: a permanent home on the internet that grows from a single `0dot.in/@username` profile into a full social feed, community spaces, and a business presence — all under one identity. This repo is the reference implementation (web app + native mobile apps), built in phases against the specs in [`docs/specs/`](docs/specs).

> Full long-range vision: [`docs/ROADMAP.md`](docs/ROADMAP.md) (16 phases, identity → social → communities → business → creator monetization → developer platform → AI → enterprise). This README covers what's actually built today: **Phases 1–16** (Phase 16's "Future Modules" list was triaged, not built module-for-module — see [its row below](#whats-built) and [`docs/specs/phase-16-future-modules.md`](docs/specs/phase-16-future-modules.md) §2 for what was in scope vs. deferred).
>
> Looking for the end-user product manual instead of the engineering README? See [`GUIDE.txt`](GUIDE.txt).

## Contents

- [What's built](#whats-built)
- [Known gaps](#known-gaps)
- [Tech stack](#tech-stack)
- [Integrations](#integrations)
- [Getting started](#getting-started)
- [Mobile apps](#mobile-apps)
- [Project structure](#project-structure)
- [Contributing / working in this repo](#contributing--working-in-this-repo)
- [License](#license)

## What's built

| Phase | Area | Highlights |
|---|---|---|
| **1 — Foundation** | Identity | Auth (bcrypt + session cookies), `@username` claiming, profile (bio, avatar/cover, themes, social links), customizable link-in-bio with click analytics and scheduling, chronological feed, full-text search |
| **2 — Social** | Follow & messaging | Follow/unfollow, blocking, end-to-end-encrypted 1:1 and group DMs with live SSE delivery, message requests, a notification system with read-time aggregation, a time-decayed trending feed |
| **3 — Communities** | Spaces | Public/restricted/private communities, moderation (ban/mute/promote/transfer ownership), rules, discovery tags, post flair, a collaborative wiki with revision history, live per-community chat, walkie-talkie-style voice rooms, community-scoped polls and Q&A, staff analytics |
| **4 — Business** | Commerce presence | Business pages with a weak-signal claim/verification gate (auto-approve on domain match, otherwise a platform-admin review queue), team roles, business-authored posts, a products/services catalog with a storefront view, attributed reviews, a jobs board with applications, MVP appointment scheduling with transactional double-booking prevention, a document library, and search integration |
| **5 — Creator** | Monetization | A processor-agnostic payments backbone (`CreatorPayoutAccount` + `PaymentTransaction` ledger, behind a `PaymentProcessor` interface now backed by **live Stripe Connect**, Accounts v2 — see [Integrations](#integrations)) underlying tips, paid membership tiers with gating, digital downloads, online courses, podcasts, a newsletter, affiliate links, and livestreams (real LiveKit video when `LIVEKIT_*` is configured, otherwise a scheduling/chat-only stub) |
| **6 — Portfolio** | `/p/project` | Project portfolios, skills, resume, linked git repositories, credentials/certificates and awards |
| **7 — Knowledge** | Publishing | Articles, multi-chapter books, a personal wiki, and downloadable published files, with reactions, comments, and search integration |
| **8 — Events** | `/e/event` | Business- or community-hosted events (owner XOR), RSVP and ticketing |
| **9 — Marketplace** | `/m/` | Freelance services at `/[username]/services` (individual-seller extension of the Phase 4 `Offering`/`Appointment` model) plus a `MarketplaceListing` browse/search surface for apps, themes, templates, and digital products |
| **10 — Developer platform** | API & OAuth | `DeveloperApp` registration, scoped OAuth2/PKCE ("Sign in with 0dot"), a bearer-authed public REST API with rate limiting and usage counters, and HMAC-signed webhook delivery with retry/backoff |
| **11 — AI platform** | AI layered on existing surfaces | A shared `AIGeneration` usage-audit substrate every AI call logs through; AI moderation (`ModerationFlag` queue), AI content writer/profile builder, AI accessibility (alt-text/captions via `MediaAccessibilityMetadata`), AI-driven recommendations replacing Phase 2's placeholder "suggested users" heuristic, AI-assisted search, and AI translation (`ContentTranslation`) — backed by **live Claude** (`@anthropic-ai/sdk`) through the swappable `ai-provider.ts` seam whenever `ANTHROPIC_API_KEY` is set; falls back to a deterministic local stub otherwise (today: always in tests/CI) |
| **12 — Trust & safety** | Moderation & review | Unified `TrustSafetyCase` case management across every surface that previously had ad hoc review (community, business, marketplace, OAuth scopes, AI flags), a `Report` center, `Appeal` workflow, spam/bot `AccountRiskSignal` detection, age controls, and transparency reporting |
| **13 — Copyright & IP** | Legal/compliance | `ContentRevision` version history for posts/articles, a full DMCA takedown/counter-notice workflow (`DMCATakedownNotice`/`DMCACounterNotice`), copyright declarations, watermarking, `ContentLicense` ownership records, 0dot brand trademark protection, and generalized `JurisdictionRule`-driven jurisdiction rules |
| **14 — Enterprise** | Organizations | `Organization` (distinct from `Business`), team management via `OrganizationMember`, internal communities (`Community.restrictedToOrganizationId`), SAML2/OIDC single sign-on (`SSOConnection`/`SSOIdentity`) with JIT provisioning, an employee directory, and `OrganizationAuditLog` reusing Phase 3's `ModAction` shape |
| **15 — Mobile apps** | PWA & first-party clients | 0dot's own apps as real OAuth clients of the Phase 10 API (no privileged internal-only path), a PWA (`manifest.json`, service worker, install prompt), web push notifications as a third delivery channel alongside in-app/email, in-app-purchase payout batching (`IapPayoutBatch`), and digital business cards (`DigitalBusinessCard`) as a `.well-known`/vCard-style share surface |
| **16 — Future modules** | Triaged reuse, not a rebuild | Of the roadmap's 16 unscheduled "Future Modules," Podcasts/Polling/Newsletters were already built in earlier phases (not duplicated); Job board resolves a deferral named back in Phase 4; Notes, Calendar, Maps, Donations, and Learning platform are thin new layers over existing entities; URL shortener (`ShortLink`), Forms & Surveys (`Form`), and a lightweight CRM (`Contact`/`Activity`) are genuinely new but modest; Cloud storage and Video hosting were scope-warned/flagged as open questions in the spec and were **not built** — see [`docs/specs/phase-16-future-modules.md`](docs/specs/phase-16-future-modules.md) §2 for the full triage table |

Everything above is server-rendered, permission-checked server-side (never just hidden in the UI), and covered by the specs in `docs/specs/phase-{1..16}-*.md`.

### Known gaps

This is an actively developed reference build, not a finished product. See [`docs/BUGS.md`](docs/BUGS.md) for the current open-findings list from an internal code review (mostly Phase 1–4 feed-visibility filtering edge cases, tracked as fixed/open per item) and [`docs/foundations/ENGINEERING_ARCHITECTURE.md`](docs/foundations/ENGINEERING_ARCHITECTURE.md) for architectural decisions and their tradeoffs (e.g. single-writer libSQL as a conscious pre-scale choice, uploaded media served at original size with no resize/format pipeline, no server-side error tracking on the web app). SMS (`src/lib/sms.ts`) is the one integration still fully stubbed — see [Integrations](#integrations).

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Turbopack, Server Actions) + **React 19**, TypeScript throughout
- **[Prisma 7](https://www.prisma.io)** over the SQLite wire protocol via **`@prisma/adapter-libsql`** — local dev is a plain `file:./dev.db`, production points at a Turso-hosted libSQL database — 163 models spanning identity, social, community, business, creator monetization, portfolio, knowledge, events, marketplace, developer-platform, AI, trust & safety, copyright/IP, enterprise, mobile/PWA, and CRM/short-link/forms/calendar domains
- **Server Components by default**; client components only at real interactivity boundaries (`useActionState` forms, live SSE consumers)
- **Media storage:** avatars, post images, business/community assets, and documents upload to **Vercel Blob** (`@vercel/blob`, private access) — see [Known gaps](#known-gaps) for the pipeline's current limits
- No database or auth service to stand up locally — SQLite/libSQL defaults to a local file, auth/sessions/encryption are self-contained. File uploads are the one feature that needs a real external credential even in dev (see below)
- **Mobile apps** (`mobile/`): Expo/React Native 0.86 + Expo Router, TypeScript, as real OAuth2/PKCE clients of the web app's own public API — see [Mobile apps](#mobile-apps)

## Integrations

Every external service sits behind a swappable interface in `src/lib/` (`PaymentProcessor`, `AIProvider`, `EmailSender`, `SmsSender`, `LivestreamProvider`) — none of the app's call sites talk to a provider SDK directly. Each one degrades to a local, zero-network stub when its credentials are absent, so the app runs fully offline out of the box; only file uploads (Vercel Blob) require a real credential even in dev.

| Service | Used for | Real when... | Stub behavior when unset |
|---|---|---|---|
| **Stripe** (`src/lib/stripe.ts`, `payments.ts`) | Payouts (Connect Accounts v2), tips, memberships, digital products, courses, event tickets, affiliate payouts | `STRIPE_SECRET_KEY` + webhook secrets are set | N/A — payment flows require this in any environment that exercises them |
| **Anthropic Claude** (`src/lib/ai-provider.ts`) | Content writer, moderation, translation, alt-text, search/recommendation re-ranking | `ANTHROPIC_API_KEY` is set | Deterministic local heuristic (keyword-based moderation, canned drafts, hash-based embeddings) — always active in tests/CI |
| **Resend / SMTP** (`src/lib/email.ts`) | Verification, password reset, newsletters | `RESEND_API_KEY` (preferred) or `SMTP_HOST` (+ user/pass) is set | Console-log stub — link is also surfaced directly on-screen in dev |
| **Vercel Blob** (`@vercel/blob`) | Avatar/post/document/attachment uploads | `BLOB_READ_WRITE_TOKEN` is set | No fallback — uploads fail with an auth error; everything else still works |
| **LiveKit** (`src/lib/livestream-provider.ts`) | Livestream/voice-room video | `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` are all set | Scheduling/gating/chat plumbing only, no real video |
| **SMS** (`src/lib/sms.ts`) | *(not yet used by any live feature)* | Never — no provider implemented yet | Console-log stub; setting `SMS_PROVIDER` to anything throws until one is added |

See [`.env.example`](.env.example) for the full, authoritative list (kept in sync with what the code actually reads) and short setup notes per var.

## Getting started

**Requirements:** Node.js 20+, npm.

```bash
git clone git@github.com:kingofyadav/0dot.git
cd 0dot
npm install
```

Copy the example env file and fill in the minimum to boot:

```bash
cp .env.example .env
```

```bash
# Local dev default is already correct — a plain SQLite file, no setup needed.
DATABASE_URL="file:./prisma/dev.db"

# 256-bit key, base64-encoded — encrypts direct-message content at rest.
# Generate a fresh one per environment; never reuse a dev value in production.
MESSAGE_ENCRYPTION_KEY="<run: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\">"

# The one credential you need even in dev — `@vercel/blob`'s put() reads this
# automatically. Get one from a Vercel Blob store linked to this project
# (`vercel env pull` if the project is already linked), or uploads will
# fail with an auth error while everything else in the app still works.
BLOB_READ_WRITE_TOKEN="..."
```

Everything else in `.env.example` (Stripe, Claude, email, LiveKit, ...) is optional for local dev — see [Integrations](#integrations) for what each one unlocks and how the app behaves without it.

Apply the schema and start the dev server:

```bash
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signup sends a verification link — in local dev, with neither `RESEND_API_KEY` nor `SMTP_HOST` set, `src/lib/email.ts` falls back to a console-log stub and the link is also surfaced directly on the "check your email" page. Set `RESEND_API_KEY`, or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (any SMTP relay — SES, Postmark, Mailgun, a self-hosted MTA), plus `EMAIL_FROM` and `APP_ORIGIN`, before launch so real email goes out instead.

### Other useful commands

```bash
npx tsc --noEmit     # typecheck
npm run lint         # ESLint
npm test             # vitest
npx prisma generate  # regenerate the Prisma client after a schema change (also runs automatically via postinstall)
npm run build        # production build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main` and every PR.

## Mobile apps

`mobile/` is a separate Expo/React Native (0.86, Expo Router, TypeScript) app for iOS and Android — 0dot's first-party mobile clients, built as real OAuth2/PKCE clients of this repo's own public API (Phase 10, see [What's built](#whats-built)), not a privileged internal path. See [`mobile/AGENTS.md`](mobile/AGENTS.md) before writing mobile code — Expo 57 has breaking changes from older training data, same spirit as this repo's own [`AGENTS.md`](AGENTS.md).

```bash
cd mobile
npm install
npx expo start
```

Some native modules (notably Reanimated, expo-sharing, expo-file-system) need a rebuilt dev client rather than a plain Expo Go session — see `mobile/eas.json`. Three separate workflows in `.github/workflows/` handle mobile CI (`mobile-ci.yml`, on any `mobile/**` push/PR), OTA updates (`mobile-ota-update.yml`, on push to `main`), and store releases (`mobile-release.yml`, on `mobile-v*.*.*` tags).

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
scripts/
  migrate-deploy.mjs     # applies pending migrations to the libsql/Turso prod DB (Prisma's engine can't)
  backup-db.mjs          # scheduled DB backup
docs/
  specs/                 # phase-by-phase product specs (the actual requirements each phase was built against)
  foundations/            # living architecture/engineering-decision docs (component library, a11y, performance, ...)
  BUGS.md                  # open-findings list from an internal code review
  ROADMAP.md               # the full 16-phase vision
mobile/
  app/                   # Expo Router screens
  src/                    # shared mobile logic
  # see Mobile apps above
```

## Contributing / working in this repo

If you're using an AI coding agent here, read [`AGENTS.md`](AGENTS.md) first — this project pins specific framework versions with breaking changes from what most training data assumes (async `cookies()`/`params`, `proxy.ts` instead of `middleware.ts`, Server Actions patterns). Check `node_modules/next/dist/docs/` before assuming an older Next.js convention applies. The `mobile/` app has its own [`mobile/AGENTS.md`](mobile/AGENTS.md) with the same caveat for Expo.

## License

Private repository (`"private": true` in `package.json`). Not currently licensed for external use, modification, or redistribution — all rights reserved.
