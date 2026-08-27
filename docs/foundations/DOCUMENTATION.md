# Documentation

Status: Foundational document (Priority 14). A meta-index — where every kind of decision gets written down, so documentation scales with the product instead of rotting.

## Current Documentation Map

| Kind | Location | Scope |
|---|---|---|
| Product roadmap + build-status ledger | `docs/ROADMAP.md` | Phases 1–16 + Future Modules, revenue model, core principles. Now also carries a per-phase Shipped/Partial/Planned status table (2026-08-27) — the phase feature bullets are kept as original intent, the table is the reality check |
| Release history | `CHANGELOG.md` | Reverse-chronological milestone log (phases, integration go-lives, mobile M1–M14, notable fixes). Reconstructed from git 2026-08-27 |
| Phase feature specs | `docs/specs/phase-N-*.md` | Data models, acceptance criteria, open questions, per phase |
| Cross-cutting addenda | `docs/specs/addendum-*.md` | Features spanning phases (billing, custom domains, premium profiles) |
| Roadmap audit trail | `docs/specs/roadmap-audit.md` | Record of gaps found in the roadmap and how each was resolved — read this before assuming the roadmap is internally complete |
| Product vision (*why*, not *what*) | `VISION.md` | Mission, principles, philosophy, explicit non-goals |
| Site structure | `INFORMATION_ARCHITECTURE.md` | Every route, live/planned/future status, relationships |
| Visual/design tokens | `DESIGN_SYSTEM.md` | Colors, type, spacing, components, motion — source of truth is `src/app/globals.css`, this document explains and formalizes it |
| Interaction rules | `UX_GUIDELINES.md` | Non-negotiable UX rules checked on every feature |
| Task flows | `docs/foundations/USER_JOURNEYS.md` | How users accomplish things, live vs. planned |
| Responsive strategy | `docs/foundations/RESPONSIVE_LAYOUT.md` | Breakpoints, layout rules (not yet implemented) |
| Component inventory | `docs/foundations/COMPONENT_LIBRARY.md` | What's built, what's missing |
| Navigation structure | `docs/foundations/NAVIGATION.md` | Desktop/mobile nav shells (mostly not yet implemented) |
| Performance targets | `docs/foundations/PERFORMANCE.md` | Numeric targets + current gaps |
| Accessibility standard | `docs/foundations/ACCESSIBILITY.md` | WCAG 2.1 AA baseline, audit checklist |
| Trust & safety | `docs/foundations/TRUST_SAFETY.md` | Standing summary of the Phase 12 moderation/account-security surface + honest flag of what's still narrow (binary privacy model, community-only mute) |
| Design consistency rules | `docs/foundations/DESIGN_CONSISTENCY.md` | One-visual-language enforcement, known debt |
| Engineering architecture | `docs/foundations/ENGINEERING_ARCHITECTURE.md` | Stack, structure, scaling decision points |
| Native mobile app | `docs/foundations/MOBILE.md` | The Expo/React Native app (`mobile/`) — architecture, web-parity status, native-module gotchas. (The web PWA half of "Phase 15" is in `ENGINEERING_ARCHITECTURE.md`, not here.) |
| Coding conventions | `CLAUDE.md` / `AGENTS.md` (web), `mobile/AGENTS.md` (mobile) | Next.js-16 / Expo-57-specific gotchas, checked-in project instructions |
| End-user product manual | `GUIDE.txt` | Non-engineering walkthrough of the product for end users |

## Conventions

- **Code comments:** only when the *why* is non-obvious (a hidden constraint, a workaround, a subtle invariant) — never restating *what* the code does. Already the practice in this codebase (e.g. the `requireVerifiedUser` redirect comments explain *why* the redirect target differs by context, not *what* `redirect()` does).
- **No planning/analysis documents beyond what's asked for.** These foundation docs exist because they were explicitly requested; don't spawn further meta-documents (e.g. a "sprint plan," a "decision log") unprompted.
- **Specs describe target state; foundation docs describe current + target state with an honest gap analysis.** Don't let a foundation doc quietly go stale by describing only the aspiration — every gap flagged here should stay flagged until the code actually closes it, at which point the doc should be updated to say so.
- **Cross-linking:** every foundation doc links to the others it depends on or is depended on by, rather than duplicating content. If the same rule needs stating in two places, one place owns it and the other links to it (e.g. `UX_GUIDELINES.md` touch-target rule is defined once, referenced from `RESPONSIVE_LAYOUT.md` and `ACCESSIBILITY.md` rather than restated).
- **Release notes:** `CHANGELOG.md` now exists (added 2026-08-27, reconstructed from git history — the product is live on 0dot.in and the mobile app has a `mobile-v1.0.1` tag, so the "first real deploy milestone" this line waited for has happened). It's a milestone log, not a per-commit changelog; keep adding to it at phase / integration / mobile-release boundaries, not on every merge.

## Maintenance Rule

When a gap flagged in one of these documents gets closed by actual implementation work (e.g. Search gets built, pagination gets added to `/feed`), update the relevant foundation doc in the same change — a foundation doc that says "not yet implemented" about something that now exists is worse than no documentation, since it actively misleads the next person (or the next session) who reads it.

**This rule was not consistently followed between ~2026-08-11 and 2026-08-27**, and a catch-up sweep on 2026-08-27 corrected a batch of stale claims across `ROADMAP.md`, `ENGINEERING_ARCHITECTURE.md`, `TRUST_SAFETY.md`, `USER_JOURNEYS.md`, `PERFORMANCE.md`, `COMPONENT_LIBRARY.md`, `DESIGN_SYSTEM.md`, `DESIGN_CONSISTENCY.md`, `RESPONSIVE_LAYOUT.md`, and `ACCESSIBILITY.md` (session management, 2FA, account deletion, feed pagination, `src/lib/search.ts`, monospace font, shadcn inventory, model count, framework versions). If you're closing a gap, update the doc in the same change — don't let this accumulate into another sweep. See `CHANGELOG.md` for the "2026-08-27 — Docs" entry.
