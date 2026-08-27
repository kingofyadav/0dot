# Addendum — Web Pro-Level Upgrade

Status: M1 built + verified live (2026-08-27 — cron chain proven in
production: GH Actions → CRON_SECRET → /api/cron/frequent → all 5 jobs
ok:true against the prod DB; in-process schedulers confirmed suppressed on
Vercel). M2–M8 planned.

**M1 follow-up (2026-08-27):** `instrumentation.ts` was at the repo root, but
this project uses a `src/` directory, so Next resolves the instrumentation
hook relative to `src/` — the root file was silently ignored in the
production build. Sentry, the `onRequestError` hook, and every boot task in
`register()` had never run on Vercel (the schedulers were "suppressed" only
because nothing ran, not because of the `if (process.env.VERCEL) return`
guard). Fixed by moving the file to `src/instrumentation.ts` (and
`src/instrumentation-client.ts`), matching `src/proxy.ts`. Sentry error
delivery verified end-to-end after the move.

This addendum is the web-side
counterpart to `addendum-mobile-pro-upgrade.md` (which took the native app
from a narrow foundation to near-web parity across M1–M14). The web app has
the opposite problem: feature breadth is complete (Phases 1–16 + every
cross-cutting addendum), but it carries accumulated architectural and polish
debt that the doc sweep of 2026-08-27 catalogued. This closes the gap between
feature-complete and pro-grade.
Owner: TBD
Related: [phase-1-foundation.md](phase-1-foundation.md), [phase-2-social-platform.md](phase-2-social-platform.md), [phase-11-ai-platform.md](phase-11-ai-platform.md), [phase-12-trust-safety.md](phase-12-trust-safety.md), [addendum-mobile-pro-upgrade.md](addendum-mobile-pro-upgrade.md), [../foundations/ENGINEERING_ARCHITECTURE.md](../foundations/ENGINEERING_ARCHITECTURE.md), [../foundations/PERFORMANCE.md](../foundations/PERFORMANCE.md)

## 1. Purpose & Scope

"Pro level" here means the product is boringly reliable under load, fast on a
mid-tier phone, honest about privacy, and consistent on every viewport — the
same bar `addendum-mobile-pro-upgrade.md` §1 set for the native app, applied
to the web app and its shared backend.

**In scope:** deployment-model correctness (the app is a single-process
stateful monolith running on a horizontally-scaling serverless platform —
this mismatch is the root of the 503 bursts), server-side observability, a
real caching layer, the image pipeline, the pagination sweep, search quality,
privacy granularity + data portability, and a responsive/design-polish sweep.

**Out of scope (own future phase, not this addendum):** "Sign in with 0dot"
as a polished third-party product (consent UX, developer funnel, published
SDKs, identity attestations); ID/domain verification as a trust product;
moving off single-writer libSQL (a decision this addendum documents but does
not execute); GraphQL API.

## 2. The core problem (why M1/M2 come first)

`src/lib/db.ts` is a network call to Turso. `src/lib/rate-limit.ts` is an
in-memory `Map`. All realtime (`src/app/api/**/stream/route.ts` × 5) is
in-memory SSE, single-process. `instrumentation.ts` starts **12
`setInterval` schedulers** (`trending`, `portfolio-sync`, `ai-accessibility`,
`ai-moderation`, `dmca`, `account-deletion`, `watermarking`,
`social-publish`, `social-content-sync`, `platform-billing`,
`custom-domains`, `api-usage-billing`) inside the web process. Caching is
`revalidatePath`-only — every request is uncached DB round-trips.

On Vercel Fluid Compute every warm instance boots **all 12 schedulers** and
holds **its own** rate-limit and SSE state. Under a traffic burst (the
viewport-prefetch storm that forced `prefetch={false}` on the nav was one
trigger), you get N instances each running 12 schedulers writing to a
**single-writer** database while also serving uncached reads against it —
a thundering herd that returns 503s. The prefetch fix treated a symptom.

M1 moves the schedulers to platform cron; M2 moves rate-limit + realtime
state to a shared store. After M2 the app is safe to run on more than one
instance — which is the actual definition of "serverless-ready" and the
precondition for everything else.

## 3. Sub-phases

### M1 — Serverless-fit reliability foundation (built)

- **Error tracking.** `@sentry/nextjs`, env-gated exactly like mobile M8:
  `Sentry.init` called directly in `src/instrumentation.ts` (server/edge) and
  `src/instrumentation-client.ts` (browser), only when a DSN is present, plus
  the `onRequestError` hook. `SENTRY_DSN` comes from the Vercel↔Sentry
  Marketplace integration; `NEXT_PUBLIC_SENTRY_DSN` is filled from it at build
  time in `next.config.ts` (the DSN is not a secret). Source-map upload runs
  only when `SENTRY_AUTH_TOKEN` is present (production builds). Provision via
  the Vercel Marketplace (`vercel:marketplace` — Sentry is a native
  integration) rather than hand-rolling.
- **Structured logger.** `src/lib/logger.ts` — a thin level-tagged wrapper
  (`logger.error/warn/info` with a context object) replacing the ~15 bare
  `console.error` call sites in `src/app`/`src/lib`, so logs are greppable
  and Sentry breadcrumbs are consistent. Not a logging framework.
- **Schedulers → platform cron.** The 12 `setInterval` jobs are grouped into
  three `/api/cron/<bucket>` Route Handlers by cadence — `frequent` (5 min:
  trending, moderation, accessibility, watermarking, social-publish),
  `hourly` (:17 — dmca-restoration, account-deletion, platform-billing,
  custom-domains), `daily` (03:23 — portfolio-sync, social-content-sync,
  api-usage-billing). Each is `CRON_SECRET`-Bearer-gated (`src/lib/cron.ts`
  → `assertCronAuthorized` + `runCronBucket`, which isolates per-job
  failures the same way `instrumentation.ts`'s `runStartupTask` does). Each
  scheduler module gained a `runXOnce()` export; `startXScheduler()` is
  untouched. `instrumentation.ts` gains `if (process.env.VERCEL) return;`
  before the 12 scheduler starts — kept in-process for local dev / a
  self-hosted single `next start`, off on Vercel.
- **Hobby-plan constraint (real).** This project is on Vercel Hobby, which
  caps cron jobs at 2 and can't do sub-daily frequency. So only the `daily`
  bucket is a native Vercel cron (`vercel.json`); `frequent` and `hourly`
  are triggered by `.github/workflows/cron.yml` (curl + `CRON_SECRET` repo
  secret). GitHub's scheduler is best-effort (delays/skips under load) —
  acceptable for these jobs. On a move to Vercel Pro, delete the workflow
  and put all three in `vercel.json`.
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run build`; each `/api/cron/*` route returns 401 without the secret
  / with a wrong one, and dispatches its bucket with the right one
  (verified live); `instrumentation.ts` no longer boots the 12 schedulers on
  Vercel.

### M2 — Shared state (planned)

- **Rate limiter.** Provision a KV/Redis store via `vercel:marketplace`
  (Upstash Redis is the native pick). Reimplement `checkRateLimit` behind
  its **exact current signature** (`(key, {max, windowMs}) => boolean`) as a
  Redis `INCR` + `EXPIRE` fixed window, with the in-memory `Map` kept as an
  automatic fallback when no store is configured (local dev, tests) — same
  "degrades to a local stub" posture every integration in this repo already
  follows.
- **Realtime.** The 5 SSE routes need cross-instance fan-out. Cheapest
  correct option: Redis pub/sub behind the existing per-feature helpers
  (`src/lib/messaging.ts` already centralises the message path). Evaluate a
  hosted realtime (Ably/Pusher via marketplace) vs. Redis pub/sub vs.
  documenting polling as the supported mode and keeping SSE best-effort.
  Decision recorded here before building.
- **Verification:** rate limit shared across two `next start` instances
  pointed at the same store; a message sent to instance A is delivered by
  instance B's stream.

### M3 — Caching layer (planned)

- Adopt Next.js 16 Cache Components (`'use cache'` + `cacheLife` +
  `cacheTag`) on the hot read paths — public profile (`/{username}`), feed
  shell, `/explore`, `/trending`, community/business landing — see
  `vercel:next-cache-components`. Tag-based invalidation (`cacheTag(`user:${id}`)`,
  `updateTag` on mutation) replaces the broad `revalidatePath` calls where a
  precise tag is available.
- CDN `Cache-Control` on genuinely public, logged-out profile views.
- `src/lib/db.ts` query batching is already the norm (`Promise.all`); this
  layer sits above it.
- **Verification:** `cacheReason` / cache-hit inspection per
  `vercel:cdn-caching`; profile page second-hit served from cache; a profile
  edit busts only that user's tag.

### M4 — Performance: images + pagination (planned)

- **Image pipeline.** Capture intrinsic width/height at upload time
  (`src/lib/uploads.ts` → store on `MediaItem` / avatar / asset rows —
  schema change), render every user image with explicit `width`/`height` +
  `loading="lazy"` + a responsive `srcset`. Decide resize strategy: Vercel
  Image Optimization in front of Blob, or a resize-on-upload step. Kills the
  `PERFORMANCE.md` Rule 2 layout-shift gap that M4 of the mobile addendum's
  web counterpart never got.
- **Pagination sweep.** Move followers/following lists, `/search` results,
  `/messages` history, `/notifications`, and the `/admin` queues onto
  `src/lib/pagination.ts` — the same cursor helper `/feed` already uses.
- **Verification:** Lighthouse CLS on a media-heavy profile; each swept list
  loads page 2; `PERFORMANCE.md` Current State + Rules updated.

### M5 — Search v2 (planned)

- Replace the Prisma `contains` core of `src/lib/search.ts` with real
  matching: SQLite FTS5 (libSQL supports it — an `FTS5` virtual table + a
  sync trigger or a rebuild job) for lexical search, and evaluate an
  embeddings layer (`src/lib/ai-search.ts` already exists as the Phase 11
  seam) for semantic "find people like X" and better feed ranking /
  recommendations.
- Keep the shared `search.ts` contract so `/search` and `GET /api/v1/search`
  both benefit.
- **Verification:** typo-tolerance and relevance-ordering test cases;
  `ENGINEERING_ARCHITECTURE.md` Search section updated.

### M6 — Privacy granularity + portability (planned)

- **Per-post audience** (`Post.visibility`: public / followers / mentioned),
  enforced in every feed/profile/search query alongside the existing
  `getPostVisibilityConditions`.
- **"Who can DM / mention / tag me"** — a small `ProfilePrivacy` settings
  model, enforced at DM-send, mention-render, and tag-on-post (the three
  points `phase-12` already gates on `isPrivate`).
- **Profile-level mute** distinct from block (`MutedUser`) — feed/notify
  suppression without the visible break a block causes.
- **Full data export** — extend `exportAccountData()` from its current ~6
  tables to a genuine account archive (async job → downloadable file), and a
  deletion receipt. Closes the `USER_JOURNEYS.md` / GDPR-grade gap.
- **Verification:** a followers-only post never appears in an
  anonymous/`/api/v1` query; a muted user's posts stay out of feed but the
  profile still loads; export archive round-trips.

### M7 — Responsive + design-polish sweep (planned)

- The web equivalent of mobile M9 ("interaction polish"). Take the ~130
  routes that currently only branch at 1024px through the `RESPONSIVE_LAYOUT.md`
  breakpoint scale, `MarketingNav`'s pattern as the reference, page by page
  (messages → communities → businesses → courses → marketplace → admin,
  roughly in traffic order).
- Retire `src/app/[username]/page.tsx`'s ~46 inline `style` objects onto
  `.stack`/`.row` + named classes.
- Full dark-mode audit (`DESIGN_SYSTEM.md` flags it as never done
  end-to-end) and a motion pass using the existing `--transition-*` tokens.
- **Verification:** each swept route tested at 375 / 768 / 1440
  (`RESPONSIVE_LAYOUT.md` Rule 2); `DESIGN_CONSISTENCY.md` inline-style note
  updated as pages land.

### M8 — Data-model hardening (planned)

- **Money precision.** Every `Float` money field (`PaymentTransaction.amount`
  /`platformFee`, `Offering.price`, ticket/listing prices, commission
  amounts — ~15 fields) is a precision risk in a payments product. libSQL's
  connector still lacks Prisma `Decimal`; the fix is integer minor units
  (store cents/paise as `Int`, format at the edge) behind a
  `src/lib/money.ts` helper. Migration + backfill.
- **Migration rollback procedure** — written, tested against a Turso branch
  (`ENGINEERING_ARCHITECTURE.md` flags its absence).
- **Single-writer decision doc** — either an accepted-until-X statement with
  the trigger metric, or a spike on libSQL embedded replicas / a Postgres
  move. Documented, not necessarily executed here.

## 4. Sequencing & independence

M1 and M2 are the foundation and are ordered (M2's shared store is what makes
multi-instance safe; M1's cron move is what stops 12× scheduler load per
instance). M3–M7 are largely independent of each other and can be picked up
in any order once M2 lands, though M3 (caching) gives the biggest
user-visible latency win and M4 the biggest mobile-web win. M8 is
independent of all of it and can slot in whenever. Each sub-phase is
independently shippable and testable, same "read the next sub-phase, build
it" cadence as the rest of `docs/specs/`.

## 5. Verification (all sub-phases)

- Root: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- `scripts/smoke-test.mjs` (post-deploy) stays green.
- Browser-tested in Chrome for any UI-affecting change, per this repo's
  convention — claims of "tested" mean actually loaded, not inferred.
- Each sub-phase updates the foundation doc it touches in the **same**
  change (`DOCUMENTATION.md` Maintenance Rule — the rule whose lapse this
  whole plan's doc-sweep predecessor existed to fix).
