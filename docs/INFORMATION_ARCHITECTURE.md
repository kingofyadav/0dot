# 0dot.in — Information Architecture

Status: Foundational document. Maps every current and planned page/route and how they relate. Status tags: **Live** (built and in the codebase today), **Planned** (has a `docs/specs/phase-*.md` spec, not built), **Future** (named in `docs/ROADMAP.md` but not yet specced). Last synced against the codebase 2026-08-05, after Phases 1–16 (see `README.md`'s "What's built" table for what each phase actually shipped); partial re-sync 2026-08-27 added the `/s/{username}/security/*` and `/two-factor` routes. Routes added since (e.g. the `/download` APK landing page) may not be reflected — treat `src/app/` as authoritative.

Before adding a new top-level route, check it against `src/lib/reserved-usernames.ts` (`RESERVED_USERNAMES`) — every top-level path segment listed below must be reserved there, or it will collide with a user's `/username` profile route.

## Top-Level Sitemap

```text
0dot.in
│
├── / ................................ Live — marketing landing (MarketingNav + DigitalHomeVisual hero, no embedded form; redirect → /feed if authed)
├── /login ........................... Live — standalone login page
├── /signup .......................... Live — standalone signup page
├── /verify, /verify/sent ............ Live — email verification Route Handler + "check your email" holding page
├── /claim-username .................. Live (Phase 1)
├── /feed ............................. Live — global reverse-chronological post feed + compose box
├── /explore .......................... Live (Phase 2) — global-chronological discovery feed, distinct from Home
├── /trending .......................... Live (Phase 2 addendum §6.2) — velocity-ranked feed
├── /notifications ..................... Live (Phase 2)
├── /messages, /messages/requests ...... Live (Phase 2) — DMs, group chats, message requests
├── /search ............................. Live (Phase 1) — users, communities, posts, businesses
├── /bookmarks ........................... Live (Phase 1)
│
├── /c, /c/new, /c/{slug} ................ Live (Phase 3) — communities index, create, individual community
├── /b, /b/new, /b/{slug} ................ Live (Phase 4) — businesses index, create, individual business
├── /p/{project} .......................... Live (Phase 6) — portfolio/project pages (no /p index/browse page exists)
├── /e, /e/new, /e/{slug} ................. Live (Phase 8) — events index, create, individual event
├── /m, /m/new, /m/{id} .................... Live (Phase 9) — marketplace listings; ROADMAP's `/store` name was implemented as `/m` instead, see note below
├── /jobs, /jobs/alerts .................... Live — job board (Phase 4 postings) plus a dedicated index and saved alerts (Phase 16, resolving Phase 4 §9.3's deferral)
│
├── /oauth/authorize, /oauth/error ........ Live (Phase 10) — OAuth2/PKCE authorization flow; also serves 0dot's own first-party apps (Phase 15), not third-party-only
├── /api .................................... Live (Phase 10) — public REST API root
├── /org/{slug} ............................. Live (Phase 14) — organization pages
├── /sso ..................................... Live (Phase 14) — SAML2/OIDC SSO endpoints
├── /trust-safety ............................ Live (Phase 12) — report/appeal center
├── /dmca ..................................... Live (Phase 13) — DMCA notice intake
├── /admin .................................... Live — platform-admin review queues (business claims, marketplace listings, trust & safety cases, ...)
│
├── /form/{id} ................................ Live (Phase 16) — public form/survey response page
├── /fund, /fund/new, /fund/{id} .............. Live (Phase 16) — donation/fundraising campaigns
├── /map ....................................... Live (Phase 16) — aggregated map view
├── /l/{code} .................................. Live (Phase 16) — short-link redirect Route Handler
├── /live/{livestreamId} ....................... Live (Phase 5) — livestream viewer
├── /podcast/{rssSlug}/rss.xml ................. Live (Phase 5) — podcast RSS feed Route Handler
├── /newsletter/unsubscribed ................... Live (Phase 5) — newsletter unsubscribe confirmation
├── /aff/{code} ................................. Live (Phase 5) — affiliate-link redirect Route Handler
├── /qr, /r ...................................... Live (Phase 1/2) — QR code generation and internal link-tracking redirects
├── /.well-known/... ............................. Live (Phase 15) — digital business card discovery
│
├── /store ........................................ Not built — see the `/m` note above
├── /developers ................................... Not built as a standalone route — developer app management lives under `/s/{username}/developer` instead
├── /settings ...................................... Not built as a standalone route — account/creator settings live under `/s/{username}` instead (see note below)
├── /blog .......................................... Future — platform's own blog, not user content
├── /help .......................................... Future — support/help center
├── /about ......................................... Future
│
└── /{username} .................................. Live — public profile (catch-all; only matches handles that pass validateUsernameFormat and aren't reserved)
    └── /s/{username}/... ......................... Live — the owner-only account/creator dashboard (settings segment `s`): profile editing, links, monetization, content (articles/books/wiki/courses/podcast/newsletter/quizzes/learning paths), portfolio, calendar, digital card, forms, short-links, notifications, developer apps, authorized apps, and security (`/security` password + `/security/sessions` session management + `/security/contact` email/phone change + `/two-factor` TOTP)
```

**`/settings` vs. `/s/{username}`:** this doc originally called for a single global `/settings` (see Cross-Cutting Structure below), but the codebase settled on scoping every account/creator-dashboard page under `/s/{username}` instead — one route tree rather than two. Treat `/s/{username}` as the authoritative settings location; `/settings` was never built and isn't planned.

## Profile Page Structure

The example structure the product brief gave (Posts / Media / Articles / Projects / Portfolio / Store / Followers / Following / Communities / About) was the target shape once Phases 2, 4, 6, 7, and 9 landed. All of those phases are built now, but the brief's literal "one tab per content type on the profile page" layout was **not** how it ended up being implemented — most content types got their own route tree (`/[username]/articles`, `/[username]/services`, `/s/{username}/content/*`, etc.) with the profile page itself surfacing a curated subset, not every content type as a distinct tab:

```text
/{username}                                Live
│
├── Header (avatar, display name, path)    Live
├── Bio                                    Live
├── Edit profile (owner only, inline)      Live
├── Links (reorder, delete, add)           Live
├── Posts                                   Live — reuses PostCard, same data as /feed filtered by author
├── Follow button + follower count (→ /{username}/followers)   Live (Phase 2)
├── Projects / Portfolio (Projects, Skills, Repositories, Papers, Certificates, Awards)   Live (Phase 6) — rendered inline, ordered by `portfolioLayoutJson`
├── Storefront/course/podcast discovery teasers (products, courses, offerings)   Live (Phase 4/5/9) — lightweight links out to the full storefront/course/booking pages, not embedded as full sections
│
├── Media                                    Future (no media/image upload pipeline exists yet — see ENGINEERING_ARCHITECTURE.md gap)
├── Articles / Books / Wiki (Phase 7)          Live as their own route trees, but not surfaced as a profile-page section — still a gap if the brief's "everything visible from the profile" goal is taken literally
├── Communities (memberships)                   Live as a concept (Phase 3 `CommunityMember`) but not listed on the profile page — same gap as Articles
└── About (expanded, distinct from bio)          Future — bio currently serves this role; split out once profile fields grow (work history, links categorization, etc.)
```

**Ordering principle for what's on the profile page:** Posts stays first (identity = activity), Links stays visible near the top regardless of what's added (it's the "why someone came here" section for the link-in-bio use case). Content types that got their own dedicated route tree instead of a profile-page section are discoverable via direct link/search rather than from `/{username}` itself — revisit whether that's still the right call as more content types accumulate.

## Relationships / Cross-Cutting Structure

- **Home (`/feed`) vs. Explore vs. Trending** — three distinct feeds, not one feed with filters: `/feed`, `/explore`, and `/trending` are separate route/component/query implementations (velocity-ranked for `/trending` per `phase-2-social-platform.md` §6.2). Do not collapse these into a single component with a tab switcher — they have different backing queries and, eventually, different caching strategies.
- **Namespace prefixes are content containers, not identity containers.** `/c/`, `/b/`, `/p/`, `/e/`, `/m/`, `/org/` all exist so that a *user's* `/{username}` namespace never collides with community/business/project/event/marketplace/organization slugs. A user's personal identity is always the bare `/{username}` route.
- **Settings ended up scoped, not global.** The original design called for one global `/settings`; the codebase instead settled on `/s/{username}` as the single account/creator-dashboard route tree (see the note under the sitemap above). Business/community-scoped settings still nest under their own resource (e.g. `/b/{slug}/manage`), consistent with the original intent — only the *account-level* half of this principle changed in practice.
- **Reserved-word discipline.** Every top-level segment ever shipped as a route must be present in `RESERVED_USERNAMES` (`src/lib/reserved-usernames.ts`) before or at the same time its route ships — this is the one place a router/validator checks. As of this sync it holds: `admin`, `api`, `www`, `help`, `settings`, `s`, `about`, `feed`, `explore`, `trending`, `c`, `b`, `p`, `e`, `jobs`, `store`, `blog`, `developers`, `login`, `signup`, `logout`, `verify`, `claim-username`, `search`, `bookmarks`, `notifications`, `r`, `uploads`, `qr`, `dmca`, `trust-safety`, `org`, `sso`, `0dot`, `l`, `m`, `form`, `fund`, `live`, `map`, `messages`, `newsletter`, `oauth`, `podcast`, `aff`. (This sync found and fixed an 11-segment gap — `l`, `m`, `form`, `fund`, `live`, `map`, `messages`, `newsletter`, `oauth`, `podcast`, `aff` had shipped as real routes in Phases 5–16 without ever being added to this set, meaning a username claim could have collided with any of them.)

## Navigation Surface Mapping

Which of the above appears in primary nav (header/sidebar) vs. is reachable only by direct link — this is decided in `docs/foundations/NAVIGATION.md`, not here. This document only maps *what pages exist and how they relate*, not *how a user gets to them*.
