# Trust & Safety

Status: Foundational document (Priority 11). The full feature spec is `docs/specs/phase-12-trust-safety.md`. Phase 12 is now built (see `README.md`'s "What's built" table) — this document used to describe a Phase-1-only MVP with zero safety affordances; that state no longer exists. It's now the standing summary + an honest flag of what's *still* missing.

## Scope (per Phase 12 spec)

- Content reporting (report center) — **Live**
- Moderation queues — **Live**
- Appeals process — **Live**
- Privacy controls — **Live** (partial, see below)
- Account recovery — **Live**
- Session management — **Live** (`/s/{username}/security/sessions` — list, revoke one, revoke all others)
- Two-factor auth — **Live** (TOTP + recovery codes: `/login/2fa`, `/s/{username}/two-factor`)
- Account deactivation / deletion — **Live** (`account-lifecycle.ts`, `/api/v1/account/lifecycle/delete`)
- Block / mute controls — **Live** (block; mute is community-scoped only, see below)

## What's live today

- **Reporting:** `ReportButton` (`src/components/ReportButton.tsx`) → `fileReport` (`src/app/actions/reports.ts`) is wired into `PostCard` (posts) and `/{username}` profiles, hidden for the content's own owner. Feeds `Report`/`TrustSafetyCase` (`prisma/schema.prisma`).
- **Moderation queue:** `TrustSafetyCase` unifies review across every surface that previously had ad hoc review (community, business, marketplace, OAuth scopes, AI flags), worked via `/admin`.
- **Appeals:** `Appeal` model + workflow — a case decision can be appealed, not just accepted silently.
- **Account recovery:** `/forgot-password` → `/forgot-password/sent`, `/reset-password` → `/reset-password/success` (`src/app/actions/auth.ts`). The gap this document used to flag ("there isn't even a forgot-password flow") is closed.
- **Session management:** `/s/{username}/security/sessions` (`revokeSession` / `revokeAllOtherSessionsAction` in `src/app/actions/session-management.ts`, guarded to the caller's own `userId`; mirrored at `/api/v1/account/sessions` + `/revoke-others` + `/[id]`) — a user can now see and revoke their own active sessions individually or all-but-current. The "no session-management UI" gap earlier revisions flagged is closed.
- **Two-factor auth:** TOTP enrollment with recovery codes (`src/lib/two-factor.ts`, `/s/{username}/two-factor` — setup / regenerate-recovery-codes / disable), enforced at login via `/login/2fa`, plus `/api/v1/account/two-factor/*` for API clients.
- **Contact-change security:** email and phone changes go through `src/app/actions/account-contact.ts` / `/s/{username}/security/contact` (verification-gated), not a bare profile edit.
- **Account deactivation / deletion:** `src/app/actions/account-lifecycle.ts` + `src/lib/account-deletion.ts` (scheduled deactivation, `User.status` transitions `active → deactivated → deleted`), also `DELETE /api/v1/account/lifecycle/delete`. See `USER_JOURNEYS.md`'s "Delete an account" entry — this is no longer unbuilt.
- **Block:** `blockUser`/`unblockUser` (`src/app/actions/block.ts`), live on `/{username}`. **Mute exists too, but only as a community-moderation action** (`muteMember`, `src/app/actions/communities.ts`) — there is no general profile-level "mute this user everywhere" control distinct from block.
- **Privacy controls, partial:** `Profile.isPrivate` gates posts/portfolio/links behind follow-approval (name/avatar/bio and the Follow control itself stay visible regardless). Age gating (`src/app/actions/age.ts`, `AgeGatePrompt`) is also live. Narrower controls (who can message/mention you, per-post visibility) are not built.
- **Spam/bot detection:** `AccountRiskSignal` (`src/lib/account-risk.ts`) exists (e.g. duplicate-post-pattern detection, referenced from `posts.ts`).
- **DMCA / copyright:** full takedown/counter-notice workflow (`/dmca`, Phase 13) — adjacent to, and reachable from, the same trust & safety surface.

## Current Gap (real, not hypothetical)

- **Privacy controls are narrower than "full."** `Profile.isPrivate` is binary (public/follow-gated); there's no granular per-post visibility or messaging/mention permission model yet. This is the main item from the original Phase 12 scope still only partially met.
- **Mute is community-scoped only.** No general profile-level "mute this user everywhere" distinct from block (`muteMember` exists only as a community-moderation action).
- **General mute / narrower privacy aside, the Phase 12 account-security scope is now complete** — session management, 2FA, and account deletion (all flagged as missing in earlier revisions of this doc) shipped in the account-settings-hardening and mobile pro-upgrade work.

## Rule

No new user-generated-content surface (comments, media posts, messages, community posts) ships without at least a report action attached — this is no longer aspirational; `ReportButton` is the existing shared component to reuse (`COMPONENT_LIBRARY.md`), not infrastructure to build from scratch.
