# 0dot.in — Product Vision

Status: Foundational document. Read before making any product or design decision that isn't already dictated by an existing `docs/specs/phase-*.md`. If a decision here conflicts with a phase spec, this document wins — the specs describe *what*, this describes *why* and *why not*.

## Mission

**Build the world's digital identity platform** where every person, creator, business, organization, and community has a permanent, secure, and customizable home on the internet.

> **One Identity. One Profile. Infinite Possibilities.**

(Carried over verbatim from `docs/ROADMAP.md` — restated here so this document is self-contained.)

## Vision

Every meaningful online interaction — a link shared in a bio, a business card handed over, a community someone belongs to, a post someone made, a product someone sells — should be traceable back to one durable, user-owned identity at `0dot.in/username`. Not a link aggregator. Not a social network. An identity layer that other surfaces (social, commerce, portfolio, community) attach to.

The test for "are we winning": five years from now, when someone wants to know who a person or business is on the internet, `0dot.in/username` is the answer, the same way an email address or phone number is today — infrastructure, not a destination people "check."

## Target Users

Ordered by who Phase 1–3 actually serves first, not by ambition:

1. **Individuals** — the baseline user. Wants one link to put everywhere (Instagram bio, resume, email signature) that represents them accurately and doesn't feel like a marketing funnel.
2. **Creators & freelancers** — need the identity to also carry proof of work (portfolio, posts) and eventually monetization (Phase 5).
3. **Small businesses & communities** — need a shared identity that isn't tied to one person (Phase 3–4).
4. **Developers** — consume identity as infrastructure via API/OAuth once the platform has enough individual adoption to be worth integrating against (Phase 10). Not a launch audience.

Enterprises, advertisers, and large organizations (Phase 14) are downstream beneficiaries of a healthy identity layer, not who the product is designed for first. If a decision would improve the experience for enterprise buyers at the cost of the individual's simplicity, the individual wins until Phase 14 is actually underway.

## Core Principles

(From `docs/ROADMAP.md`, each expanded with what it rules in/out.)

- **User-first design** — when a feature benefits the platform's growth/retention metrics at the user's expense (dark patterns, artificial friction to leaving, engagement-maximizing notification spam), the user's interest wins.
- **Privacy by default** — new fields and features default to the most private reasonable setting; visibility is something a user opts into, not out of.
- **Open APIs** — identity data a user owns should be exportable and, eventually, programmable by them (Phase 10), not locked in.
- **Secure by design** — auth, session, and input-handling decisions are made conservatively even when it costs velocity (already reflected in this codebase: bcrypt cost 12, DB-backed sessions, reserved-username collision checks before every write).
- **Fast performance** — see `docs/foundations/PERFORMANCE.md` for concrete targets.
- **Accessibility** — see `docs/foundations/ACCESSIBILITY.md`; treated as a standing requirement on every feature, not a Phase 11 AI add-on.
- **Transparent moderation** — actions taken against a user's content or account are explainable and appealable (Phase 12).
- **Respect for intellectual property** — content ownership stays with the creator (Phase 13).
- **Compliance with applicable laws** — data handling and content policy account for multi-jurisdiction operation from the start, not retrofitted at Phase 14 (Enterprise/SSO) time.
- **Long-term, stable URLs** — a username, once claimed and active, is a permanent address. This constrains username reclamation, redirects, and deletion policy design more than it might seem to at MVP stage.

## Product Philosophy

- **Consistency before complexity.** The most successful platforms don't win on feature count — they win because every interaction feels predictable, fast, and polished across devices. Every new feature is built on the same design system and interaction patterns as what came before, or the design system evolves first (see `DESIGN_SYSTEM.md`).
- **Identity as infrastructure, not content.** The profile is the product; the feed, communities, and commerce are surfaces that reference it. If a feature makes sense only in isolation from the profile, it's out of scope or belongs in a different product.
- **One profile, many surfaces.** A user should never need a second account to be a creator vs. a professional vs. a community member. Namespacing (`/c/`, `/b/`, `/p/`, `/e/`) organizes *content*, not identity.
- **Boring and reliable beats flashy and fragile.** Premium means polish and trustworthiness (fast, consistent, no broken states), not maximal visual flourish. The tricolor accent system in `globals.css` is deliberately restrained for this reason — accents, not a theme.
- **Ship the foundation once, correctly.** Auth, session, theming, and the design system are expensive to redo later at scale. These get more scrutiny per line of code than a typical feature.

## Long-Term Goals (5–10 Years)

- `0dot.in/username` becomes a recognized, portable identity primitive — usable as a login/verification method by third-party apps via Phase 10's OAuth ("Sign in with 0dot"), the way "Sign in with Google" is used today.
- The platform sustains itself primarily through premium profiles, business/creator subscriptions, and marketplace/transaction fees (per the Revenue Model in `docs/ROADMAP.md`) — not primarily advertising. Advertising stays explicitly optional.
- Every phase in `docs/ROADMAP.md` (Communities → Enterprise) ships as a natural extension of the identity layer, not a pivot away from it.
- The platform operates credibly across jurisdictions, with Trust & Safety (Phase 12) and Copyright/IP (Phase 13) infrastructure mature enough to support that before Enterprise (Phase 14) customers depend on it.

## Problems We're Solving

- **Identity fragmentation.** A person's online presence is scattered across platforms that each own a slice of it and can revoke access at any time.
- **Link-in-bio tools are dead ends.** Existing tools (Linktree and similar) solve "one link" but stop there — no real identity, no content, no growth path once a user outgrows a static link list.
- **No unified surface across life roles.** A freelancer today needs a LinkedIn, a portfolio site, an Instagram, and a payment link, none of which talk to each other or share reputation/social proof.
- **Digital identity isn't owned.** Usernames, follower graphs, and content live inside platforms that can suspend, algorithmically bury, or monetize against the user's interest.

## What We Deliberately Won't Build

- **Not a general-purpose social network competing on attention.** The feed (Phase 1–2) exists to give an identity activity and proof of life, not to maximize time-on-app via an addictive ranking algorithm. No infinite engagement-optimized "For You" ranking as a core value proposition.
- **Not an ad-first business.** Advertising is explicitly optional/secondary revenue (`docs/ROADMAP.md` Revenue Model). We do not build a data-brokerage or ad-targeting business on top of user identity data.
- **Not a crypto/NFT speculation platform.** No token-gating, no NFT profile pictures as a monetization feature, regardless of trend pressure.
- **Not a dark-pattern growth engine.** No fake urgency, no engagement notifications designed to manufacture anxiety, no deceptive unsubscribe/account-deletion flows. Account deletion (Phase 12) must be as easy as account creation.
- **Not selling user data.** Consistent with "Privacy by default" — monetization is subscriptions/transactions/fees, never data sales.
- **Not chasing every future module immediately.** The `docs/ROADMAP.md` "Future Modules" list (business cards, URL shortener, calendar, cloud storage, CRM, etc.) is intentionally deferred — each is only in scope once the identity layer it would attach to actually exists and has users.
