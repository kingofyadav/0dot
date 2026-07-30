# Trust & Safety

Status: Foundational document (Priority 11). The full feature spec is `docs/specs/phase-12-trust-safety.md` — this document is the standing summary + an honest flag of what's missing *today*, since Phase 1–2 surfaces are already live without any of this.

## Scope (per Phase 12 spec)

- Content reporting (report center)
- Moderation queues
- Appeals process
- Privacy controls
- Account recovery
- Session management
- Block / mute controls

## Current Gap (real, not hypothetical)

Every live surface today — `/feed`, `/{username}` profiles, posts, likes — has **zero** safety affordances:

- No way to report a post, profile, or user.
- No block or mute.
- No moderation queue exists (nor could it, with nothing feeding it).
- No account recovery path at all (flagged also in `USER_JOURNEYS.md` — there isn't even a "forgot password" flow yet, let alone account-takeover recovery).
- Session management exists at the infrastructure level (DB-backed sessions, 30-day TTL, `destroySession` on logout) but has no user-facing surface — a user can't view or revoke their own active sessions today.
- Privacy controls: none. Profiles are public by default with no visibility settings.

This is a normal state for an MVP still inside Phase 1, but it means the platform currently has a live, publicly-postable feed with **no abuse-handling mechanism whatsoever**. Worth surfacing explicitly rather than letting it stay implicit: this is the biggest gap between "world-class foundation" and current reality, more so than any visual/design gap.

## Recommended Sequencing (not a decision, a suggestion for when this is picked up)

1. **Report + block/mute** first — the minimum viable safety net, and the cheapest to build (no queue/appeals infrastructure required, just a report record and a personal block list).
2. **Session management UI** — cheap (infrastructure already exists), high trust value, closes part of the "account recovery" gap by letting a user kick out a stolen session.
3. **Password recovery** — arguably should happen even before #1, since it's not really a "trust & safety" feature so much as a basic account-access primitive missing from Phase 1 itself.
4. **Moderation queue + appeals** — only valuable once reports exist to queue (#1).
5. **Privacy controls** (profile visibility, who can message/mention) — sequence relative to Phase 2 (Follow/Messaging), since most privacy controls only matter once those surfaces exist.

## Rule

No new user-generated-content surface (comments, media posts, messages, community posts) ships without at least a report action attached, once #1 above exists as a shared component. Until then, this is a known, accepted gap — not a silent one.
