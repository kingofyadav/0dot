# Changelog

Milestone-level history of 0dot.in — phase builds, integration go-lives, mobile
releases, and notable fixes. **Not** a per-commit log; see `git log` for that.
Reconstructed from git history on 2026-08-27, then maintained forward at
phase / integration / mobile-release boundaries.

The product is live at **0dot.in**. There are no semver web releases yet, so
entries are grouped by date. The mobile app is separately versioned
(`mobile-v*` tags).

---

## 2026-08-27 — Docs

- Rewrote `docs/ROADMAP.md` as a vision doc **plus** a per-phase build-status ledger.
- Added `docs/foundations/MOBILE.md` (native app architecture + web-parity status).
- Added this `CHANGELOG.md`.
- Catch-up sweep of stale claims across the foundation docs (session management, 2FA, account deletion, feed pagination, `src/lib/search.ts`, monospace font, shadcn inventory, model count 148→163, Next.js 16.2→16.3). See `docs/foundations/DOCUMENTATION.md`'s Maintenance Rule.

## 2026-08-21 → 2026-08-27 — Mobile pro-upgrade M8–M14, upload hardening, `/download`

- **Mobile M8–M14** (`docs/specs/addendum-mobile-pro-upgrade.md`): reliability foundation (CI, Jest tests, Sentry), interaction polish, bearer-token SSE realtime (messages + presence), in-app-purchase compliance (engineering half), full settings/account parity with web (2FA, sessions, contact change), a stale-search-deferral closure, and live-testing fallout fixes (voice notes + file attachments in DMs).
- **Upload hardening:** uploaded file bytes are verified against their declared MIME type; `x-powered-by` header dropped.
- **`/download`:** redesigned into a standalone landing page serving the APK from Vercel Blob (not an expiring EAS link).
- **Post-deploy smoke test** (`scripts/smoke-test.mjs`) added to CI — guards against "bug" reports that are actually prod lagging a `git push`.
- **DB seed / cleanup scripts** added; EAS owner slug mismatch fixed.
- Bug-fix passes: upload MIME loss, notification-badge races, replay/presence/pagination bugs (mobile); stale bottom-nav badge and preview CSP error (web).

## 2026-08-19 → 2026-08-23 — World-class UI/UX pass, platform roles, global payouts

- **UI/UX pass:** design-system adoption across the app — `ConfirmButton` (~40 call sites), `EmptyState` (~80), `.stack`/`.row` layout utilities, live-site QA fixes.
- **Platform roles:** unified platform-admin + trust-safety staff into one `PlatformRole`; `/admin/businesses` approval page.
- **Stripe Connect:** payouts made global (were India-only); `identity.country` set correctly for Accounts v2; idempotency keys on all Checkout Session creation.
- **Perf:** batch sequential DB queries + Suspense-stream non-critical sections; fixed an unmemoized DB write on every auth check (slow buttons app-wide); mobile TTFB fix (stop re-seeding the OAuth scope catalog per request); disable prefetch on persistent nav links (503 bursts).
- **Desktop header search** added; env files reorganized (`.env.example`, secret-leak fix).
- Security: fixed critical security/payments gaps from a post-launch audit; CSP fix that had blanked the production site; several Dependabot bumps.

## 2026-08-19 → 2026-08-21 — Mobile app build-out

- **Native mobile app** (`mobile/`): PKCE-authenticated Expo client — home feed, notifications, profile/post navigation, then Phase A–C and Phase 15 work (offline caching, onboarding, tablet-responsive layout, write-path parity, rich profile/media).
- **Mobile pro-upgrade M1–M7:** Communities, Businesses, Marketplace, Events, Wallet, Messages, Search, Bookmarks — each with a matching `/api/v1` route built first.
- Mobile CI/release workflows; real push delivery via Expo's relay; OAuth refresh-token grant (closes a silent-logout gap).
- **Design pass:** mobile app moved onto the web app's own design-token system.

## 2026-08-12 → 2026-08-15 — Integrations go live, coin wallet

- **Stripe Connect** wired for real: creator payouts (tips, memberships, courses, digital products, offerings, tickets, marketplace, donations).
- **Stripe Billing** wired for real: premium profiles + business subscriptions (direct-to-platform SaaS charges).
- **Stripe Billing Meters** wired for real API-usage billing.
- **Resend** wired for real email delivery + the email notification channel; styled HTML templates for verify / reset / email-change.
- **Coin wallet** (`addendum-coin-wallet.md`): UPI top-up, coin-funded VIP, manual payout — later simplified to direct coin transfers.
- Account-settings hardening + platform-billing, custom-domains, and premium-profiles addenda built.
- Profile privacy fields enforced at DM-send, tag-on-post, and search/explore.

## 2026-08-06 → 2026-08-11 — Foundations, settings, landing redesign

- **Product docs:** vision, design system, information architecture, UX guidelines, bug tracker.
- **CI + test suite + DB backups + SEO routes**; Prisma switched to the libSQL adapter for the Turso-backed production DB; pending migrations wired into every production deploy.
- **Settings:** Android-Settings-style UI kit; every settings group reskinned onto shared card / danger-zone patterns.
- **Global keyboard shortcuts:** command palette, nav chords, list navigation.
- **Landing page** redesigned with marketing nav + live username-availability check; later iterated to the `MarketingNav` + `DigitalHomeVisual` hero.
- **Accent palette rebranded** from the Indian tricolor to Google's 4-color system (used semantically, not decoratively).
- Direct messaging, community chat, voice rooms, and livestream chat hardened; cross-posting to external social platforms.
- PWA install experience fixed for iOS/iPadOS/macOS Safari; media uploads routed to Vercel Blob.

## 2026-07-30 → 2026-08-06 — Phases 1–16

- **Phase 1 — Foundation:** identity, `@username` claiming, profile, link-in-bio with click analytics + scheduling, chronological feed, full-text search.
- **Phase 2 — Social:** follow/block, E2E-encrypted DMs + group chats with SSE, message requests, notifications, trending feed.
- **Phase 3 — Communities:** public/restricted/private, mod tools, wiki, live chat, voice rooms, polls, Q&A.
- **Phase 4 — Business:** business pages with a claim/verification gate, catalog + storefront, reviews, jobs board, appointments, document library.
- **Phase 5 — Creator:** processor-agnostic payments backbone, tips, memberships, digital downloads, courses, podcasts, newsletter, affiliate links, livestreams.
- **Phase 6 — Portfolio:** projects, skills, resume, git repos, credentials, awards.
- **Phase 7 — Knowledge:** articles, books, personal wiki, published files.
- **Phase 8 — Events:** business- or community-hosted events, RSVP, ticketing.
- **Phase 9 — Marketplace:** freelance services + a `MarketplaceListing` browse surface (shipped at `/m`, not `/store`).
- **Phase 10 — Developer platform:** `DeveloperApp` registration, scoped OAuth2/PKCE, bearer-authed REST API with rate limiting, HMAC-signed webhooks.
- **Phase 11 — AI platform:** `AIGeneration` audit substrate, moderation queue, content writer / profile builder, alt-text/captions, recommendations, AI-assisted search, translation — via a swappable provider seam.
- **Phase 12 — Trust & safety:** unified `TrustSafetyCase`, report center, appeals, spam/bot detection, age controls, transparency reporting.
- **Phase 13 — Copyright & IP:** version history, DMCA takedown/counter-notice, copyright declarations, watermarking, ownership records.
- **Phase 14 — Enterprise:** organizations, team management, internal communities, SAML2/OIDC SSO with JIT provisioning, employee directory, audit logs.
- **Phase 15 — Mobile/PWA:** PWA (manifest, service worker, install prompt), web push, IAP payout batching, digital business cards.
- **Phase 16 — Future modules:** triaged, not rebuilt — URL shortener, forms/surveys, lightweight CRM, and thin layers for notes/calendar/maps/donations/learning; cloud storage + video hosting deliberately not built.
- Post-Phase-1–4 review fixed 5 auth/UX bugs + 13 security/correctness issues.
