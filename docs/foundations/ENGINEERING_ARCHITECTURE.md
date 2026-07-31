# Engineering Architecture

Status: Foundational document (Priority 13). Documents the current architecture as built, plus explicitly undecided/future areas — this is a map of what exists and what's still open, not a spec for unbuilt systems (those belong in their own phase specs when the time comes).

## Frontend

- **Next.js 16.2.12, App Router, Turbopack.** Breaking-changes-from-training-data note (per `AGENTS.md`): async `cookies()`/`headers()`/`params`/`searchParams`, `proxy.ts` (exported `proxy` function) replacing `middleware.ts`, Server Actions via `"use server"`. Always check `node_modules/next/dist/docs/` before assuming older Next.js conventions apply.
- **Server Components by default**, Client Components only at real interactivity boundaries (`ComposeBox`, `ThemeToggleLogo`, form components using `useActionState`). See `PERFORMANCE.md` rule 3.
- **Forms:** `useActionState` + Server Actions pattern throughout, `formRef.current?.reset()` for reset-on-success. No client-side form library (react-hook-form etc.) — not needed yet at current form complexity.
- **Styling:** plain CSS in `globals.css` with CSS custom properties for theming, no CSS-in-JS, no Tailwind. Component-scoped CSS modules exist minimally (`page.module.css`, mostly unused post-refactor). This is a deliberate simplicity choice so far — revisit only if the shared-class approach stops scaling, not preemptively.
- **Theming:** manual `data-theme` attribute + `localStorage` + inline pre-hydration `<script>`, `suppressHydrationWarning` on `<html>`. See `DESIGN_SYSTEM.md`.

## Backend

- **No separate backend service** — Server Actions and Route Handlers inside the Next.js app are the entire backend today. This is appropriate at current scale; revisit when Phase 10 (public API, OAuth, webhooks) needs a surface that isn't naturally a Next.js route (e.g. long-running jobs, webhook delivery retries).
- **Auth:** custom session-cookie auth (`src/lib/session.ts`), bcrypt (cost 12) password hashing, DB-backed sessions with 30-day TTL, cookie name `0dot_session`. No OAuth/SSO yet (Phase 14 need). No password reset flow yet (flagged in `USER_JOURNEYS.md` and `TRUST_SAFETY.md` as a real gap, not a future-phase item — this is missing *now*).
- **Route protection pattern:** `requireVerifiedUser()` helper (in `src/app/actions/posts.ts`) redirects unauthenticated/unverified users — this pattern should be extracted to a shared location (`src/lib/auth-guards.ts` or similar) before a third Server Action file needs the same check, rather than being copy-pasted.

## Database

- **Prisma 7.9.1 + SQLite**, `provider = "prisma-client"` generator, custom output (`src/generated/prisma`), **required** driver adapter (`@prisma/adapter-better-sqlite3`, `PrismaBetterSqlite3` class) — Prisma 7 no longer accepts a bare `DATABASE_URL` string.
- **Models today:** `User`, `Session`, `EmailVerificationToken`, `Username`, `Profile`, `Link`, `Post`, `PostLike`, plus the rest of Phase 2 (`Follow`, `Block`, `Notification`) and Messaging (`Conversation`, `ConversationParticipant`, `Message`, `MessageRequestState`) — this list had drifted behind the schema even before messaging landed; treat `prisma/schema.prisma` as the source of truth, not this bullet.
- **Known scaling ceiling: SQLite is single-node — conscious decision, not a silent gap.** This bullet used to flag Messaging as the trigger point for a SQLite→Postgres migration decision. That decision has now been made explicitly: messaging shipped on SQLite/better-sqlite3, matching every other model, since this is still a solo-dev/pre-launch project with no concurrent-write traffic to justify the migration cost yet (new datasource, connection pooling, `Decimal` support returning for `Post.trendingScore`, a real deployment/hosting decision). Revisit when there's an actual concurrent-write problem, not preemptively.
- **No migration-rollback story documented yet.** Prisma migrations are applied forward only so far; worth a written rollback procedure before this matters in production.

## APIs

- No public API yet (Phase 10). Internal data access is entirely Server Actions/Server Components calling Prisma directly — no internal REST/GraphQL layer, which is correct for a monolithic Next.js app at this stage.

## Caching

- None beyond Next.js's built-in `revalidatePath` invalidation after mutations. No Redis/CDN-edge caching layer. Fine at current traffic; revisit alongside the SQLite→Postgres decision, since both are scale-driven, not urgent today.

## Search

- **Does not exist.** No search index, no search route, despite being a named Phase 1 launch feature (`docs/ROADMAP.md` — "Search: Users, Communities, Posts, Businesses"). This is a real, currently-unaddressed Phase 1 gap, distinct from the Phase 2+ items — worth prioritizing relative to Follow System, not automatically after it, since it was scoped as Phase 1.

## Media Processing

- **Does not exist.** No file upload endpoint, no image storage/CDN, no processing pipeline. Blocks: avatar upload, "image/video posts" (named Phase 1 Feed feature), cover photos. This is the other real Phase 1 gap alongside Search — both were roadmap Phase 1 items that the build so far has not yet reached, despite Phase 1's Identity/Links/Feed-text/Auth pieces being done.

## Monitoring

- **None.** No error tracking (Sentry or similar), no performance monitoring, no uptime checks. See `PERFORMANCE.md`'s note on why this is worth closing early rather than late.

## CI/CD

- **None yet.** No GitHub Actions or equivalent — `npx tsc --noEmit` and `npx eslint src/` are run manually before each change is considered done (established practice this session), but nothing enforces this automatically on push/PR. Worth setting up before multiple contributors are involved, since manual discipline doesn't scale past one person.

## Scalability

Not a current concern given traffic, but the two concrete forward-looking decisions already identified above (SQLite→Postgres, caching layer) are the ones to revisit first when it becomes one. Keep services/modules loosely coupled (already true — Server Actions are organized per-domain: `auth.ts`, `profile.ts`, `posts.ts`) so a future split (e.g. extracting messaging into its own service) doesn't require an untangling project first.
