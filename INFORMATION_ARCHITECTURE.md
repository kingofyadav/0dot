# 0dot.in — Information Architecture

Status: Foundational document. Maps every current and planned page/route and how they relate. Status tags: **Live** (built and in the codebase today), **Planned** (has a `docs/specs/phase-*.md` spec, not built), **Future** (named in `docs/ROADMAP.md` but not yet specced).

Before adding a new top-level route, check it against `src/lib/reserved-usernames.ts` (`RESERVED_USERNAMES`) — every top-level path segment listed below must be reserved there, or it will collide with a user's `/username` profile route.

## Top-Level Sitemap

```text
0dot.in
│
├── / ................................ Live — landing (signup/login, or redirect → /feed if authed)
├── /login ........................... Live — standalone login page
├── /signup .......................... Live — standalone signup page
├── /verify .......................... Live — email verification Route Handler (GET, consumes token)
├── /verify/sent ...................... Live — "check your email" holding page
├── /feed ............................. Live — global reverse-chronological post feed + compose box
│
├── /explore .......................... Planned (Phase 2) — chronological/global discovery feed, distinct from Home
├── /trending .......................... Planned (Phase 2 addendum, §6.2) — velocity-ranked feed
├── /notifications ..................... Planned (Phase 2)
├── /messages ........................... Planned (Phase 2) — DMs, group chats
├── /search ............................. Planned (Phase 1) — users, communities, posts, businesses
├── /communities ........................ Planned (Phase 3) — index; individual community at /c/{slug}
├── /c/{community} ...................... Planned (Phase 3)
├── /b/{business} ....................... Planned (Phase 4)
├── /p/{project} ......................... Planned (Phase 6) — portfolio/project pages
├── /e/{event} ........................... Planned (Phase 8)
├── /jobs ................................ Future (named in ROADMAP Platform URLs, no phase spec section dedicated to a jobs index page yet — Phase 4 covers business-posted jobs)
├── /store ................................ Planned (Phase 9) — marketplace
├── /blog .................................. Future — platform's own blog, not user content
├── /help ................................... Future — support/help center
├── /settings ................................ Planned (Phase 1/12) — account, privacy, session management
├── /api ....................................... Planned (Phase 10) — public API root
├── /developers ................................ Planned (Phase 10) — developer dashboard
├── /about ...................................... Future
│
└── /{username} .................................. Live — public profile (catch-all; only matches handles that pass validateUsernameFormat and aren't reserved)
```

## Profile Page Structure

The example structure the product brief gave (Posts / Media / Articles / Projects / Portfolio / Store / Followers / Following / Communities / About) is the **target shape once Phases 2, 4, 6, 7, and 9 land**. Today:

```text
/{username}                                Live
│
├── Header (avatar, display name, path)    Live
├── Bio                                    Live
├── Edit profile (owner only, inline)      Live
├── Links (reorder, delete, add)           Live
├── Posts                                   Live — reuses PostCard, same data as /feed filtered by author
│
├── Followers / Following                   Planned (Phase 2)
├── Media                                    Future (no media/image upload pipeline exists yet — see ENGINEERING_ARCHITECTURE.md gap)
├── Articles                                  Planned (Phase 7 — Knowledge)
├── Projects / Portfolio                       Planned (Phase 6)
├── Store                                       Planned (Phase 9)
├── Communities (memberships)                   Planned (Phase 3)
└── About (expanded, distinct from bio)          Future — bio currently serves this role; split out once profile fields grow (work history, links categorization, etc.)
```

**Ordering principle for when these sections land:** Posts stays first (identity = activity), Links stays visible near the top regardless of what's added (it's the "why someone came here" section for the link-in-bio use case), everything else appends below in the order its phase ships, not in the brief's example order — no reason to reorder Followers above Posts, for instance, since Phase 1–2 already established Posts as primary.

## Relationships / Cross-Cutting Structure

- **Home (`/feed`) vs. Explore vs. Trending** — three distinct feeds, not one feed with filters: `/feed` is currently global-chronological (will become follow-based "Home" once Phase 2's follow system ships, per `phase-2-social-platform.md` §6), `/explore` stays global-chronological, `/trending` is velocity-ranked. Do not collapse these into a single component with a tab switcher without checking that spec — they have different backing queries and, eventually, different caching strategies.
- **Namespace prefixes are content containers, not identity containers.** `/c/`, `/b/`, `/p/`, `/e/` all exist so that a *user's* `/{username}` namespace never collides with community/business/project/event slugs. A user's personal identity is always the bare `/{username}` route.
- **Settings is global, not per-surface.** One `/settings`, not `/b/{business}/settings` + `/settings` as separate systems — business/community-scoped settings nest under their own resource instead (e.g., `/b/{business}/settings`) once Phase 4 exists, but account-level settings (password, sessions, privacy, notifications) stay under the single global `/settings`.
- **Reserved-word discipline.** Every top-level segment in this document (`feed`, `explore`, `trending`, `notifications`, `messages`, `search`, `communities`, `c`, `b`, `p`, `e`, `jobs`, `store`, `blog`, `help`, `settings`, `api`, `developers`, `about`, `login`, `signup`, `verify`) must be present in `RESERVED_USERNAMES` before or at the same time its route ships. `feed`, `login`, `signup`, `verify` are already reserved (confirmed in codebase); the rest need to be added when their phase starts, not retroactively.

## Navigation Surface Mapping

Which of the above appears in primary nav (header/sidebar) vs. is reachable only by direct link — this is decided in `docs/foundations/NAVIGATION.md`, not here. This document only maps *what pages exist and how they relate*, not *how a user gets to them*.
