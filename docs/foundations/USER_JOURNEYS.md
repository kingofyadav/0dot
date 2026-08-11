# User Journeys

Status: Foundational document (Priority 5). Documents how different users accomplish tasks today, and the target journey for tasks not yet built. Every journey is checked against `UX_GUIDELINES.md` before it ships.

Legend: **Live** (works today, verified in Chrome), **Planned** (has a phase spec), **Future** (not yet specced).

## New user onboarding — Live

1. Visitor lands on `/` → a minimal marketing hero (`MarketingNav` + `DigitalHomeVisual`), not an embedded form. `MarketingNav`'s "Create your 0dot" (or clicking any `DigitalHomeVisual` node) is the only path onward — no signup form on this page anymore (see `INFORMATION_ARCHITECTURE.md`'s `"/"` row; `AuthTabs`/`LandingLiveShowcase` are superseded, see `COMPONENT_LIBRARY.md`).
2. On `/signup`: fills displayName + username + email + password in one step (no separate "claim username" step — collapsed intentionally to reduce friction). While typing the username, `UsernameField` debounces (~400ms) a call to `checkUsernameAvailability` (`auth.ts`) and shows live checking/available/taken/reserved/invalid/network-error states — a preview only, `signup()` re-validates format and availability itself regardless of what the field reported.
3. Submits → account + username + profile created in one transaction, verification email logged (no email provider wired yet — dev-mode console log), redirected to `/verify/sent?token=...`.
4. Clicks the (dev-mode) verification link → `/verify` Route Handler validates token, creates session, redirects to the user's own new profile (`/{username}`) — the "here's your new page" moment, deliberately not `/feed`.
5. Friction points to watch as this becomes real: no actual email delivery yet (blocks real-world testing of this journey end-to-end), no resend-verification-email action yet.

## Log in — Live

1. `/login` → email + password → `createSession` → if unverified, `/verify/sent`; if verified, `/feed` (not back to own profile — a returning user wants to see what's new, not their own page every time).

## Log out — Live

Single "Log out" button in header (only visible when authenticated) → `destroySession` → `/login`.

## Create/edit a profile — Live

Profile fields (displayName, bio) editable inline via a collapsed `<details>` disclosure on the owner's own profile page, plus a full account/creator dashboard at `/s/{username}`. Avatar upload is built (`saveUploadedImage`/`@vercel/blob`, wired in `profile.ts`) — falls back to the `Logo` mark only when no avatar has been set.

## Add / reorder / remove a link — Live

Owner-only: `AddLinkForm` appends a link; each link row has up/down reorder buttons (disabled at the ends) and a delete button, all as separate Server Action forms (`moveLink`, `deleteLink`) — no drag-and-drop yet despite `docs/ROADMAP.md` Phase 1 naming "drag-and-drop ordering." Current up/down-button approach is a reasonable MVP substitute; upgrading to drag-and-drop is a Phase 1 follow-up, not a new phase.

## Publish a post — Live

Logged-in + verified user only (`requireVerifiedUser` guard). Compose box on `/feed` → `createPost` (1–500 chars) → appears at top of `/feed` and on the author's profile Posts section, `#hashtag`/`@mention` tokens styled and linked at render time.

## Like / unlike a post — Live

Toggle button on `PostCard`, `aria-pressed` reflects state, `toggleLike` Server Action flips `PostLike` + denormalized `likeCount` in a transaction, `revalidatePath("/feed")`.

## Delete a post — Live

Owner-only button on `PostCard` → soft-delete (`deletedAt` set, not a hard delete) → disappears from feed and profile.

## View a public profile as an anonymous visitor — Live

`/{username}` renders fully for logged-out visitors (bio, links, posts) with owner-only controls hidden. Header shows a "Join for free" CTA instead of the logout button, specifically only on profile pages (checked via `validateUsernameFormat` against the current path segment) — not shown on `/`, `/login`, or `/signup` themselves, which are chromeless (no `SiteHeader`, see `isChromelessPath`/`route-context.ts`) and carry their own "Create your 0dot"/"Log in" navigation instead (`MarketingNav`, `AuthTopBar`).

## Follow a user — Live (Phase 2)

Follow button on another user's profile (`followUser`/`unfollowUser`, `src/app/actions/follow.ts`; `acceptFollowRequest`/`rejectFollowRequest` for private-account follow requests), follower/following counts on the profile. `/feed` is follow-based Home, `/explore` is the separate global-chronological feed, `/trending` is a third, velocity-ranked feed — three distinct implementations, not one component with a filter (see `INFORMATION_ARCHITECTURE.md`).

## Send a direct message — Live (Phase 2)

`/messages`, `/messages/requests` — end-to-end-encrypted 1:1 and group DMs (`src/lib/messaging.ts`) with live SSE delivery, message requests for first-contact-from-a-stranger, file/voice-note attachments.

## Join a community — Live (Phase 3)

`/c/{slug}` — join/leave, moderator roles (ban/mute/promote/transfer ownership), rules, discovery tags, post flair, wiki, live chat, voice rooms, polls, Q&A.

## Create a business page — Live (Phase 4)

`/b/{slug}` — distinct ownership model from personal profiles (`BusinessMember` roles, not a single `authorId`), weak-signal claim/verification gate (auto-approve on domain match, otherwise a platform-admin review queue), products/services catalog, jobs board, appointment scheduling.

## Report abuse — Live (Phase 12)

`ReportButton` (`src/components/ReportButton.tsx`) → `fileReport` (`src/app/actions/reports.ts`) is wired into `PostCard` (posts, hidden for the post's own author) and `/{username}` profiles (hidden for the profile owner), feeding the shared `TrustSafetyCase`/`Report` queue and the `Appeal` workflow. Block/unblock (`blockUser`/`unblockUser`, `src/app/actions/block.ts`) is likewise live on the profile page. See `docs/foundations/TRUST_SAFETY.md` for the full moderation surface.

## Delete an account — Planned (Phase 12)

Target: self-service, no dark patterns, clear explanation of what happens to the username (reclaimed after a grace period, per "long-term stable URLs" in `VISION.md` — the exact grace period is an open question, not decided here). **Still not built** — no account-deletion action exists anywhere in `src/app/actions/`, despite the rest of Phase 12 (report/block/appeal/moderation/age-gating/privacy) having shipped. See `docs/foundations/TRUST_SAFETY.md`.

## Recover a forgotten password — Live

`/forgot-password` → `/forgot-password/sent`, `/reset-password` → `/reset-password/success` (`src/app/actions/auth.ts`). No longer the gap flagged in earlier revisions of this document.
