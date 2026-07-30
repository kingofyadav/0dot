# User Journeys

Status: Foundational document (Priority 5). Documents how different users accomplish tasks today, and the target journey for tasks not yet built. Every journey is checked against `UX_GUIDELINES.md` before it ships.

Legend: **Live** (works today, verified in Chrome), **Planned** (has a phase spec), **Future** (not yet specced).

## New user onboarding — Live

1. Visitor lands on `/` → sees signup form by default (Logo + "Welcome" heading, per `AuthTabs`).
2. Fills displayName + username + email + password in one step (no separate "claim username" step — collapsed intentionally to reduce friction).
3. Submits → account + username + profile created in one transaction, verification email logged (no email provider wired yet — dev-mode console log), redirected to `/verify/sent?token=...`.
4. Clicks the (dev-mode) verification link → `/verify` Route Handler validates token, creates session, redirects to the user's own new profile (`/{username}`) — the "here's your new page" moment, deliberately not `/feed`.
5. Friction points to watch as this becomes real: no actual email delivery yet (blocks real-world testing of this journey end-to-end), no resend-verification-email action yet.

## Log in — Live

1. `/login` → email + password → `createSession` → if unverified, `/verify/sent`; if verified, `/feed` (not back to own profile — a returning user wants to see what's new, not their own page every time).

## Log out — Live

Single "Log out" button in header (only visible when authenticated) → `destroySession` → `/login`.

## Create/edit a profile — Live

Profile fields (displayName, bio) editable inline via a collapsed `<details>` disclosure on the owner's own profile page — no separate "settings" page yet. Avatar upload not yet built (falls back to the `Logo` mark).

## Add / reorder / remove a link — Live

Owner-only: `AddLinkForm` appends a link; each link row has up/down reorder buttons (disabled at the ends) and a delete button, all as separate Server Action forms (`moveLink`, `deleteLink`) — no drag-and-drop yet despite `docs/ROADMAP.md` Phase 1 naming "drag-and-drop ordering." Current up/down-button approach is a reasonable MVP substitute; upgrading to drag-and-drop is a Phase 1 follow-up, not a new phase.

## Publish a post — Live

Logged-in + verified user only (`requireVerifiedUser` guard). Compose box on `/feed` → `createPost` (1–500 chars) → appears at top of `/feed` and on the author's profile Posts section, `#hashtag`/`@mention` tokens styled and linked at render time.

## Like / unlike a post — Live

Toggle button on `PostCard`, `aria-pressed` reflects state, `toggleLike` Server Action flips `PostLike` + denormalized `likeCount` in a transaction, `revalidatePath("/feed")`.

## Delete a post — Live

Owner-only button on `PostCard` → soft-delete (`deletedAt` set, not a hard delete) → disappears from feed and profile.

## View a public profile as an anonymous visitor — Live

`/{username}` renders fully for logged-out visitors (bio, links, posts) with owner-only controls hidden. Header shows a "Join for free" CTA instead of the logout button, specifically only on profile pages (checked via `validateUsernameFormat` against the current path segment) — not shown on the landing page itself, which already has its own signup form front and center.

## Follow a user — Planned (Phase 2)

Target: a Follow button on another user's profile (not shown on your own), follower/following counts visible on the profile, `/feed` eventually becomes follow-based "Home" with `/explore` taking over the current global-chronological behavior (per `phase-2-social-platform.md` §6). Not started.

## Send a direct message — Planned (Phase 2)

Target: `/messages`, 1:1 and group threads, file sharing, voice notes per the phase spec. Not started — no messaging schema exists yet.

## Join a community — Planned (Phase 3)

Target: `/c/{community}`, join/leave, moderator roles, rules acceptance on join. Not started.

## Create a business page — Planned (Phase 4)

Target: `/b/{business}`, distinct ownership model from personal profiles (a business page has member/admin roles, not a single `authorId`). Not started.

## Report abuse — Planned (Phase 12)

Target: report action available on any post, profile, comment, or message; feeds a moderation queue; reporter gets a status update; reported user can appeal. **Currently not built anywhere in the product, including Phase 1 surfaces that already ship (posts, profiles).** This is a real gap worth flagging now: every live surface today (feed, profile) has zero abuse-reporting affordance. See `docs/foundations/TRUST_SAFETY.md`.

## Delete an account — Planned (Phase 12)

Target: self-service, no dark patterns, clear explanation of what happens to the username (reclaimed after a grace period, per "long-term stable URLs" in `VISION.md` — the exact grace period is an open question for the Phase 12 spec, not decided here). **Not built today** — there is no account-deletion action anywhere in `src/app/actions/`.

## Recover a forgotten password — Future

Not specced anywhere yet. A real gap: today, a user who forgets their password has no recovery path at all (only signup/login exist). Worth prioritizing ahead of most Phase 2+ social features, since it's a basic account-access primitive, not a social feature.
