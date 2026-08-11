# Trust & Safety

Status: Foundational document (Priority 11). The full feature spec is `docs/specs/phase-12-trust-safety.md`. Phase 12 is now built (see `README.md`'s "What's built" table) — this document used to describe a Phase-1-only MVP with zero safety affordances; that state no longer exists. It's now the standing summary + an honest flag of what's *still* missing.

## Scope (per Phase 12 spec)

- Content reporting (report center) — **Live**
- Moderation queues — **Live**
- Appeals process — **Live**
- Privacy controls — **Live** (partial, see below)
- Account recovery — **Live**
- Session management — **Still missing**
- Block / mute controls — **Live** (block; mute is community-scoped only, see below)

## What's live today

- **Reporting:** `ReportButton` (`src/components/ReportButton.tsx`) → `fileReport` (`src/app/actions/reports.ts`) is wired into `PostCard` (posts) and `/{username}` profiles, hidden for the content's own owner. Feeds `Report`/`TrustSafetyCase` (`prisma/schema.prisma`).
- **Moderation queue:** `TrustSafetyCase` unifies review across every surface that previously had ad hoc review (community, business, marketplace, OAuth scopes, AI flags), worked via `/admin`.
- **Appeals:** `Appeal` model + workflow — a case decision can be appealed, not just accepted silently.
- **Account recovery:** `/forgot-password` → `/forgot-password/sent`, `/reset-password` → `/reset-password/success` (`src/app/actions/auth.ts`). The gap this document used to flag ("there isn't even a forgot-password flow") is closed.
- **Block:** `blockUser`/`unblockUser` (`src/app/actions/block.ts`), live on `/{username}`. **Mute exists too, but only as a community-moderation action** (`muteMember`, `src/app/actions/communities.ts`) — there is no general profile-level "mute this user everywhere" control distinct from block.
- **Privacy controls, partial:** `Profile.isPrivate` gates posts/portfolio/links behind follow-approval (name/avatar/bio and the Follow control itself stay visible regardless). Age gating (`src/app/actions/age.ts`, `AgeGatePrompt`) is also live. Narrower controls (who can message/mention you, per-post visibility) are not built.
- **Spam/bot detection:** `AccountRiskSignal` (`src/lib/account-risk.ts`) exists (e.g. duplicate-post-pattern detection, referenced from `posts.ts`).
- **DMCA / copyright:** full takedown/counter-notice workflow (`/dmca`, Phase 13) — adjacent to, and reachable from, the same trust & safety surface.

## Current Gap (real, not hypothetical)

- **No session-management UI.** Sessions exist at the infrastructure level (DB-backed, 30-day TTL, `destroySession` on logout) but a user still can't view or revoke their own active sessions — the one item from the original Phase 12 scope that's genuinely still missing. Checked directly: no route or component anywhere under `/s/{username}/security` (or elsewhere) lists or revokes sessions.
- **No account-deletion flow.** Not originally scoped as part of this document's list, but a closely related gap — see `USER_JOURNEYS.md`'s "Delete an account" entry.
- **Privacy controls are narrower than "full."** `Profile.isPrivate` is binary (public/follow-gated); there's no granular per-post visibility or messaging/mention permission model yet.

## Rule

No new user-generated-content surface (comments, media posts, messages, community posts) ships without at least a report action attached — this is no longer aspirational; `ReportButton` is the existing shared component to reuse (`COMPONENT_LIBRARY.md`), not infrastructure to build from scratch.
