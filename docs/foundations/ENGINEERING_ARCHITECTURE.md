# Engineering Architecture

Status: Foundational document (Priority 13). Documents the current architecture as built, plus explicitly undecided/future areas — this is a map of what exists and what's still open, not a spec for unbuilt systems (those belong in their own phase specs when the time comes).

## Frontend

- **Next.js 16.2.12, App Router, Turbopack.** Breaking-changes-from-training-data note (per `AGENTS.md`): async `cookies()`/`headers()`/`params`/`searchParams`, `proxy.ts` (exported `proxy` function) replacing `middleware.ts`, Server Actions via `"use server"`. Always check `node_modules/next/dist/docs/` before assuming older Next.js conventions apply.
- **Server Components by default**, Client Components only at real interactivity boundaries (`ComposeBox`, `ThemeToggleLogo`, form components using `useActionState`). See `PERFORMANCE.md` rule 3.
- **Forms:** `useActionState` + Server Actions pattern throughout, `formRef.current?.reset()` for reset-on-success. No client-side form library (react-hook-form etc.) — not needed yet at current form complexity.
- **Styling:** plain CSS in `globals.css` with CSS custom properties for theming as the primary system, no CSS-in-JS. Tailwind CSS v4 + shadcn/ui were added 2026-08 (additive — no existing page/component was migrated; see `DESIGN_SYSTEM.md`'s Tooling section for the token-bridging setup). Component-scoped CSS modules exist minimally (`page.module.css`, mostly unused post-refactor).
- **Theming:** manual `data-theme` attribute + `localStorage` + inline pre-hydration `<script>`, `suppressHydrationWarning` on `<html>`. See `DESIGN_SYSTEM.md`.

## Backend

- **No separate backend service** — Server Actions and Route Handlers inside the Next.js app are the entire backend today. This is appropriate at current scale; revisit when Phase 10 (public API, OAuth, webhooks) needs a surface that isn't naturally a Next.js route (e.g. long-running jobs, webhook delivery retries).
- **Auth:** custom session-cookie auth (`src/lib/session.ts`), bcrypt (cost 12) password hashing, DB-backed sessions with 30-day TTL, cookie name `0dot_session`. Password reset (`/forgot-password`, `/reset-password`) is built (`src/app/actions/auth.ts`) — see `USER_JOURNEYS.md`. First-party OAuth2/PKCE ("Sign in with 0dot") and SAML2/OIDC SSO are also both built (Phases 10/14 — `/oauth/authorize`, `/sso`).
- **Route protection pattern:** `requireVerifiedUser()` (`src/lib/auth-guards.ts`) redirects unauthenticated/unverified users — already the shared helper this bullet used to call for, imported across most `src/app/actions/*.ts` files rather than copy-pasted per file.

## Database

- **Prisma 7.9.1 + SQLite wire protocol**, `provider = "prisma-client"` generator, custom output (`src/generated/prisma`), **required** driver adapter — Prisma 7 no longer accepts a bare `DATABASE_URL` string. `src/lib/db.ts` uses `@prisma/adapter-libsql` (`PrismaLibSql`) exclusively now: local dev defaults to `DATABASE_URL="file:./dev.db"` (no `DATABASE_AUTH_TOKEN` needed), production points at a Turso-hosted libSQL database via the same env var plus `DATABASE_AUTH_TOKEN`. `@prisma/adapter-better-sqlite3` is still a listed dependency but `db.ts` no longer imports it — the libsql adapter's local-file mode covers the same dev use case.
- **148 models** spanning identity, social, community, business, creator monetization, portfolio, knowledge, events, marketplace, developer-platform, AI, trust & safety, copyright/IP, enterprise, mobile/PWA, and CRM/short-link/forms/calendar domains (see `README.md`'s tech stack section) — treat `prisma/schema.prisma` as the source of truth, not any enumerated list here.
- **Turso resolves the earlier single-node SQLite scaling concern for reads/replication**, but the app is still a single-writer model (libSQL's write path is still one primary) — revisit again if concurrent-write volume becomes a real bottleneck, not preemptively. `Decimal` support (needed for `Post.trendingScore`, currently `Float`) still isn't available through this connector.
- **No migration-rollback story documented yet.** Prisma migrations are applied forward only so far; worth a written rollback procedure before this matters in production.

## APIs

- **`/api` — bearer-authed public REST API (Phase 10)**, `DeveloperApp` registration, scoped OAuth2/PKCE, rate limiting, usage counters, HMAC-signed webhook delivery with retry/backoff. Internal data access (everything not going through `/api`) is still entirely Server Actions/Server Components calling Prisma directly — no internal REST/GraphQL layer, which remains correct for a monolithic Next.js app at this stage; `/api` exists specifically for third-party/external consumers, not as this app's own internal data-access path.

## Caching

- None beyond Next.js's built-in `revalidatePath` invalidation after mutations. No Redis/CDN-edge caching layer. Fine at current traffic; revisit alongside the single-writer/concurrent-write scaling question flagged under Database above, since both are scale-driven, not urgent today.

## Search

- **`/search` (`src/app/search/page.tsx`) is live** — users, communities, businesses, and posts, matching the Phase 1 launch scope (`docs/ROADMAP.md`). Implemented as plain Prisma `contains` queries directly in the page (no dedicated `src/lib/search.ts`, no search index/engine) — fine at current data volume, but `contains` has no relevance ranking and no full-text/fuzzy matching; revisit if result quality or query latency becomes a problem at scale. Phase 11 layers AI-assisted search on top of this (`src/lib/ai-search.ts`) rather than replacing it.

## Media Processing

- **Exists, via Vercel Blob.** `src/lib/uploads.ts` wraps `@vercel/blob`'s `put()` (`access: "private"`, random-suffix-free paths under `uploads/`) behind type-checked helpers — `saveUploadedImage` (avatars, post media, business/community assets — PNG/JPEG/WEBP/GIF, size-capped per caller), `saveDocumentFile` (PDF/EPUB), plus message-attachment (voice notes, files) variants. No dedicated image-resizing/responsive-format pipeline on top of it yet — an uploaded image is served back at its original size (see `PERFORMANCE.md`'s width/height + lazy-loading gap on `PostCard.tsx`'s `PostMediaGrid`, which renders a plain `<img>`).
- **No CDN in front of it beyond whatever Vercel Blob itself provides** — no separate image-transformation/resize-on-the-fly service.

## Monitoring

- **Client-side analytics and Core Web Vitals exist**: `@vercel/analytics` (custom events — `hero_cta_click`, `nav_cta_click`, `username_check`, `3d_node_click`, etc. — plus pageviews) and `@vercel/speed-insights`, both mounted once in `layout.tsx`. **Still missing:** server-side error tracking (no Sentry or equivalent — an unhandled exception in a Server Action/Route Handler has no capture path beyond server logs), uptime checks, and server-side latency/APM tracking.

## CI/CD

- **`.github/workflows/ci.yml`** runs on every push to `main` and every PR: `npm ci` → `prisma generate` → `prisma migrate deploy` (against a throwaway `file:./ci.db`) → `tsc --noEmit` → `eslint` → `npm test --if-present` → `next build`. `postinstall` also runs `prisma generate` automatically on every `npm install` (not just in CI), so a fresh clone/deploy always has a matching client without a manual step. No separate deploy-on-merge job here — deployment itself goes through Vercel's own git integration, not this workflow.

## Scalability

Not a current concern given traffic, but the two concrete forward-looking decisions already identified above (concurrent-write volume on the single-writer libSQL setup, a real caching layer) are the ones to revisit first when it becomes one. Keep services/modules loosely coupled (already true — Server Actions are organized per-domain: `auth.ts`, `profile.ts`, `posts.ts`) so a future split (e.g. extracting messaging into its own service) doesn't require an untangling project first.
