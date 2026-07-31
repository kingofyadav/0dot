# 0dot.in

**One Identity. One Profile. Infinite Possibilities.**

0dot.in is a digital identity platform: a permanent home on the internet that grows from a single `0dot.in/@username` profile into a full social feed, community spaces, and a business presence — all under one identity. This repo is the reference implementation, built in phases against the specs in [`docs/specs/`](docs/specs).

> Full long-range vision: [`docs/ROADMAP.md`](docs/ROADMAP.md) (16 phases, identity → social → communities → business → creator monetization → developer platform → AI → enterprise). This README covers what's actually built today: **Phases 1–4**.

## What's built

| Phase | Area | Highlights |
|---|---|---|
| **1 — Foundation** | Identity | Auth (bcrypt + session cookies), `@username` claiming, profile (bio, avatar/cover, themes, social links), customizable link-in-bio with click analytics and scheduling, chronological feed, full-text search |
| **2 — Social** | Follow & messaging | Follow/unfollow, blocking, end-to-end-encrypted 1:1 and group DMs with live SSE delivery, message requests, a notification system with read-time aggregation, a time-decayed trending feed |
| **3 — Communities** | Spaces | Public/restricted/private communities, moderation (ban/mute/promote/transfer ownership), rules, discovery tags, post flair, a collaborative wiki with revision history, live per-community chat, walkie-talkie-style voice rooms, community-scoped polls and Q&A, staff analytics |
| **4 — Business** | Commerce presence | Business pages with a weak-signal claim/verification gate (auto-approve on domain match, otherwise a platform-admin review queue), team roles, business-authored posts, a products/services catalog with a storefront view, attributed reviews, a jobs board with applications, MVP appointment scheduling with transactional double-booking prevention, a document library, and search integration |

Everything above is server-rendered, permission-checked server-side (never just hidden in the UI), and covered by the specs in `docs/specs/phase-{1,2,3,4}-*.md`.

### Known gaps

This is an actively developed reference build, not a finished product. See [`BUGS.md`](BUGS.md) for the current open-findings list from an internal code review (13 tracked issues, mostly feed-visibility filtering edge cases) and [`docs/foundations/ENGINEERING_ARCHITECTURE.md`](docs/foundations/ENGINEERING_ARCHITECTURE.md) for architectural decisions and their tradeoffs (e.g. SQLite as a conscious pre-scale choice, no public API yet, no CDN/media pipeline).

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Turbopack, Server Actions) + **React 19**, TypeScript throughout
- **[Prisma 7](https://www.prisma.io)** + **SQLite** (`@prisma/adapter-better-sqlite3`) — 47 models across identity, social, community, and business domains
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

Open [http://localhost:3000](http://localhost:3000). Signup sends a verification link — in local dev, without a transactional email provider configured, it's logged to the server console (`[dev] Verification link for ...`) instead of emailed.

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
    b/, c/              # business (/b) and community (/c) route trees
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
