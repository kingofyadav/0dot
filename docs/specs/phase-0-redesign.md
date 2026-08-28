# Phase 0 — Visual & Interaction Redesign Spec

Status: Planned. This is a cross-cutting polish program, not a product phase — it
ships no new features and no schema changes. It raises the craft level of every
surface that already exists to the bar set by Apple, Stripe, Linear, Notion, and
Airbnb: predictable, fast, quietly premium.
Owner: TBD
Related: [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) ·
[../UX_GUIDELINES.md](../UX_GUIDELINES.md) ·
[../foundations/DESIGN_CONSISTENCY.md](../foundations/DESIGN_CONSISTENCY.md) ·
[../foundations/COMPONENT_LIBRARY.md](../foundations/COMPONENT_LIBRARY.md) ·
[../VISION.md](../VISION.md)

Branch: `redesign/phase-0-foundation` (and follow-on `redesign/phase-N-*` branches
per §7).

## 1. Purpose & Scope

The engineering foundation is already strong — tokenized CSS, documented design
decisions, a shadcn bridge, a perf and a11y baseline. The **visual and interaction
execution has not caught up to it**. Screens are functional but read as
developer-default: flat type hierarchy, near-invisible borders, unbalanced
columns, bare-text empty states, heavy misaligned controls, almost no motion.

Phase 0 closes that gap. It is explicitly **evolutionary, not a rebrand** — per
`VISION.md` ("boring and reliable beats flashy and fragile"), the Google 4-color
semantic system and the restrained tone stay. What changes is craft:
hierarchy, rhythm, depth, motion, and consistency, executed to the level where
the interface stops being something a user has to parse.

**In scope:** the token layer, the shared component vocabulary, every primary
signed-in surface, the logged-out storytelling surfaces, a motion system, a
responsive audit, and Expo-app parity.

**Out of scope:** new features, new routes (except a dev-only styleguide), schema
changes, copy rewrites beyond UI microcopy, and any change to the
`data-theme` / logo-pairing / 4-color decisions that `DESIGN_SYSTEM.md` marks as
settled by explicit product direction.

## 2. Success Criteria

- **Hero routes at the bar.** `/`, `/[username]`, `/feed`, `/explore`, and
  `/s/[username]` each survive a side-by-side screenshot comparison with the
  reference companies' equivalent surfaces without an obvious craft gap.
- **One visible vocabulary.** Every card, button, input, list row, empty state,
  and skeleton across the app is an instance of a shared primitive — no route
  carries a one-off treatment (`DESIGN_CONSISTENCY.md` rule).
- **No bare states.** Every list/collection view has a designed empty, loading,
  and error state. Zero `<p className="mutedText">Nothing yet.</p>` remain.
- **Balanced at every width.** Every signed-in page is visually balanced at
  480 / 768 / 1024 / 1280 / 1536 — no dead gutters, no content hugging one edge.
- **Motion is systematic.** Page enter, list stagger, press, and hover-lift come
  from named tokens/utilities, not per-component tuning. `prefers-reduced-motion`
  zeroes all of it (already enforced globally — must stay true).
- **No regressions.** Lighthouse/Speed Insights on the hero routes stay within 2
  points of pre-redesign; the streaming/Suspense and Sentry-defer work from
  Aug 2026 is preserved; the a11y baseline (focus-visible, 44px targets,
  contrast) holds against every new component.
- **Docs in lockstep.** `DESIGN_SYSTEM.md` and the foundations docs are updated
  in the same PR as the code that changes them — the codebase's existing norm.

## 3. Diagnosis (current state, 2026-08-28)

Observed on the running app (feed, explore, profile, communities, messages,
settings, edit-profile):

| # | Area | Problem |
|---|---|---|
| D1 | Layout balance | Desktop is a `240px / 1fr / 320px` grid, but main-column content is capped ~640px and does not optically center — large empty gutters, pages read as sparse. Information density is low. |
| D2 | Type hierarchy | Near-flat. Page titles, section headings, body, and meta sit within one narrow size/weight band. No display tier in real use. Section labels are tiny all-caps (`YOU`, `SPACES`, `POSTS`). |
| D3 | Depth & color | `--border` at 12% opacity is nearly invisible; `--surface` barely separates from `--background`. `--shadow` tiers exist but are hardly consumed. The UI reads as flat gray with occasional blue despite the 4-color system. |
| D4 | PostCard | Action row is heavy bordered pills, vertically misaligned; `+Quote` / `+Reply` are stacked text links adding two rows; a **Report** button is surfaced on every post. No author avatars. Large dead space between the action row and the card's bottom edge. |
| D5 | Empty states | `EmptyState` component exists but is not used on feed / explore / profile posts / profile links / messages / communities — all show bare text, violating `UX_GUIDELINES.md` #10. |
| D6 | Profile header | Display name + action buttons overlap the cover image with no scrim → poor contrast (the `flex-start` + padding-top overlap math is fragile — see `globals.css` `.profileHeaderRow` comment). Metadata row (`0 links 0 followers 0 following`) is cramped with no separators. A `+ CREATOR STUDIO` link floats orphaned in the left gutter. |
| D7 | Forms | Native `<input type=file>` ("Choose file, No file chosen") and native `<select>` render unstyled. `Switch` and checkbox are hand-rolled per form. |
| D8 | Motion | `--transition-*` tokens defined; almost no page transitions, list stagger, or micro-interaction in practice. |
| D9 | Iconography | lucide at small sizes / thin strokes reads as frail, especially in the sidebar. No standard size/stroke convention. |
| D10 | Contextual rail | `Suggested for you` names truncate mid-word (`Harpreet …`); Follow button crowds the name; card borders invisible; `0dot Pro` upsell is the most visually prominent thing on the page. |
| D11 | Landing `/` | Hero is an `h1` + one line + a link + `DigitalHomeVisual`, then the auth card. No product story, no proof, no craft sequence — the weakest surface, and the one that most defines the Apple/Stripe comparison. |
| D12 | Loading | Skeletons exist (`Skeleton.tsx`, `ContextualRailSkeleton`) but don't match final component shapes; most client fetches have no skeleton at all. |

## 4. Design direction

Evolve the existing system. Concretely:

### 4.1 Color & depth
- Keep every hue. Retune **`--border`** to roughly 8–14% depending on context via
  two tokens (`--border` hairline, `--border-strong` for card edges that must
  read), and make the `--shadow` / `--shadow-md` / `--shadow-lg` tiers actually
  carry elevation (cards get `--shadow`, not just a border).
- Add a `--surface-2` step for nested/inset regions (composer inside feed,
  code blocks, table headers) so depth has three levels, not two.
- Introduce `--overlay-scrim` (a foreground-derived gradient) for text-on-media
  (profile cover, media posts, event headers).

### 4.2 Typography
- Keep Geist Sans / Geist Mono. Add real display tiers (`--text-5xl`,
  `--text-6xl`) for marketing and hero numbers, and set deliberate
  `letter-spacing` / `line-height` per tier (tight tracking + tight leading on
  display, normal on body) as named tokens (`--tracking-tight`,
  `--leading-display`, …) rather than ad hoc.
- Define the weight ladder (`400` body / `500` label / `600` interactive /
  `700` heading — already the informal rule) as heading element defaults in
  `globals.css`, so a bare `<h2>` is correct without a class.
- Replace tiny all-caps section labels with a single `.eyebrow` treatment
  (slightly larger, `500`, `--tracking-wide`, `--muted-foreground`).

### 4.3 Layout & density
- Settle the container question: main-column content width becomes a small set of
  named widths (`--measure-prose` ~640px, `--measure-feed` ~600px,
  `--measure-wide` ~960px), each centered in the main grid area, with the grid
  itself tuned so "centered" means centered under the header search, not hugging
  the sidebar.
- Give every page a consistent top rhythm (page title block → content) instead of
  each route inventing its own top margin.
- Kill orphaned elements (D6's Creator Studio link) — everything lives in a
  deliberate slot.

### 4.4 Motion
- Four primitives, as utility classes + a `useReveal` hook:
  `motion-page-in` (main content fade+rise on route change, via the View
  Transitions API where supported), `motion-stagger` (list children ease in on
  first paint / append), `motion-press` (scale 0.97 active), `motion-lift`
  (translateY + shadow on hover for cards/rows).
- All four collapse to no-op under `prefers-reduced-motion` and the
  `data-reduced-motion` attribute already set server-side in `layout.tsx`.

### 4.5 Iconography
- Standard sizes: `16` (inline/meta), `20` (buttons, list rows), `24` (nav,
  headers). Standard stroke `1.75`. A thin `<Icon>` wrapper or a documented
  `size`/`strokeWidth` convention so no call site passes ad hoc values.

### 4.6 Signature
The one element the redesign is remembered by: the **identity node** motif from
`DigitalHomeVisual` — a small orbital cluster of real links/content around a
center avatar — becomes a reusable, restrained component used at three scales:
hero (landing), section (empty profile, onboarding), and inline (the avatar ring
already hints at it). It is the visual argument for "one identity, many surfaces"
and it is the *only* place the redesign spends boldness. Everything else stays
quiet.

## 5. Component work (Phase 1 of execution — see §7)

Priority order, each delivered with light/dark parity, focus state, 44px targets,
a styleguide entry, and a skeleton:

1. **PostCard** — inline icon+count actions with hover states; Report / Quote /
   Copy link move into an overflow `DropdownMenu`; author `Avatar` added; padding
   rhythm fixed; media grid gets aspect-ratio boxes.
2. **EmptyState** — icon or identity-node illustration + one-line direction (in
   the interface's voice) + primary action; adopted on every list view.
3. **Inputs** — themed `Select`, a real file-upload control (drag/drop + preview,
   no native `Choose file`), `Switch`, `Checkbox`, `Radio`, `Textarea` with
   auto-grow; all shadcn-backed where a primitive exists.
4. **Card / ListRow / Section** — one elevation, radius, and padding language;
   `ListRow` covers suggested-users, followers, search results, conversations.
5. **Buttons** — reconcile `.button` / `.buttonSecondary` / `.iconButton` with
   `ui/button.tsx` into one variant set (`primary` / `secondary` / `ghost` /
   `destructive` + `icon` sizing); no fourth variant without a `DESIGN_SYSTEM.md`
   edit.
6. **Tabs / DropdownMenu / Popover / Tooltip / Toast** — align to the new depth
   and motion tokens.
7. **Skeletons** — one per component above, shape-matched.
8. **PageHeader** — title + optional description + actions slot; replaces every
   route's hand-rolled top block.

## 6. Surface work (Phases 2–5 of execution)

- **Feed** — composer expands on focus with a real toolbar and media preview;
  balanced column; designed empty/loading; a "new posts" pill on append.
- **Profile** (`/[username]`) — cover with `--overlay-scrim`; header layout that
  doesn't depend on fragile overlap math; metadata with middot separators;
  links as a polished responsive grid; portfolio/section blocks on one rhythm;
  identity-node empty state. Migrate the ~46 inline `style` objects opportunistically.
- **Explore** — real structure: trending topics, people to follow, categories —
  not a raw post list.
- **Settings** (`/s/[username]`) — form density pass, new input components, the
  left settings accordion aligned to the sidebar's visual system.
- **Contextual rail** — fix truncation; de-emphasize the Pro upsell; spacing.
- **Nav** (sidebar + bottom nav + mobile menu) — icon/label rhythm, `.eyebrow`
  section labels, active-state treatment that matches the header gradient bar
  (`NAVIGATION.md` rule 3).
- **Landing `/`** — the big one. Rebuild as a scroll sequence: hero (identity
  node at hero scale) → links → feed → communities → business → creator →
  developer, each a crafted section with one visual and honest proof, motion on
  scroll, a strong closing CTA. The tasteful interactive/WebGL moment (the Lusion
  reference) lives here and only here, as the identity node evolved.
- **Auth** (`/login`, `/signup`) — make the front door feel premium; keep them
  single-purpose (no full `MarketingNav`, per `COMPONENT_LIBRARY.md`).
- **Marketing** — `/about`, `/help`, pricing, changelog on a marketing layer that
  shares tokens with the app but has its own layout language.
- **Mobile (`mobile/`)** — bring the Expo app to the new language: matching type
  scale, the new component treatments, motion parity where React Native allows.
  Coordinate with `docs/foundations/MOBILE.md` and the Reanimated gotchas in
  memory.

## 7. Execution sequence

One branch + PR per phase, off `redesign/phase-0-foundation` then merged forward.
Docs updated in the same PR.

| Phase | Branch | Deliverable |
|---|---|---|
| **0. Foundation** | `redesign/phase-0-foundation` | Token layer (§4.1–4.5), motion primitives, `Icon` convention, a **dev-only `/dev/styleguide` route** rendering every primitive in both themes. Nothing else user-visible changes. `DESIGN_SYSTEM.md` rewritten to match. |
| **1. Components** | `redesign/phase-1-components` | §5. **Landed:** EmptyState (icon/title/description — ~80 call sites upgraded), PageHeader, `Icon`, `.card`/`.section`, PostCard action row (`.postAction`), post-byline avatars (`postAvatarProps`), Report/owner controls recede-until-hover (in lieu of an overflow menu), form-input `--border-strong` edges + a consistent custom `<select>` chevron. **Still open:** Switch/Checkbox/Radio components (still hand-rolled per form), a drag/drop file-upload (the styled `::file-selector-button` is acceptable for now), `.button` ↔ `ui/button.tsx` reconciliation, shape-matched skeletons. |
| **2. App surfaces** | `redesign/phase-2-surfaces` | Feed, Profile, Explore, Settings, rail, nav (§6). **Landed:** nav (colour not opacity, active accent bar, 1.75 icon stroke, `.eyebrow` labels); contextual rail (quiet hairline upgrade card — D10; `UserListItem` `compact` mode fixing 320px truncation); PostCard card treatment (`--border-strong` + resting shadow — D3); profile header (`--overlay-scrim` cover, `--text-3xl` name, metadata spacing, **and the structural fix** — only the avatar overlaps now via its own `--profile-avatar-lift`, off the fragile 96px-assumption math) + designed empty states; explore now has a real discovery header (`ExploreDiscovery` — people / communities / businesses, streamed) above a labelled post list; auth pages (`--border-strong` + `--shadow-md` card, display headline). **Still open:** feed composer expand-on-focus, settings form-density pass, `--measure-*` container adoption, "new posts" append affordance. |
| **3. Storytelling** | `redesign/phase-3-story` | Landing rebuild, auth, marketing layer (§6). **In progress:** the `/` landing gained a below-the-fold story — `MarketingStory` (5 scroll-revealed sections: links / feed / communities & business / developers / closing CTA, each with a small CSS-built visual, `motion-reveal` via `useReveal`) + `MarketingFooter` (real routes only, per NAVIGATION.md rule 2). Hero headline moved to the `--text-4xl`→`--text-5xl` display treatment; `MarketingNav` got a translucent ground. The DigitalHomeVisual identity node stays the one bold element (§4.6). `/login` + `/signup` got the shared-CSS polish (bigger `.authCard` headline, `--border-strong` + `--shadow-md` card, `--muted-foreground` divider) and inherit the new hero display type. `/about` shipped as the first real marketing page — content sourced verbatim from `VISION.md` (mission, principles, "what we won't build"), `MarketingNav` + `MarketingFooter`, linked from the footer, smoke-tested. **Deferred, and correctly so:** `/pricing` is blocked on a finance decision — `PLAN_PRICES` in `platform-billing.ts` are explicitly flagged as placeholders, not real prices, so a public pricing page would publish numbers that aren't real; `/help` needs a content system (help articles), not a design pass; `/changelog` needs a source of truth. These three are product/content work, not redesign work — track them outside this spec. |
| **4. Cross-cutting** | `redesign/phase-4-sweep` | View Transitions, responsive audit at all five breakpoints, empty/loading/error sweep, dark/light parity pass, a11y re-audit, perf guardrails. |
| **5. Mobile** | `redesign/phase-5-mobile` | Expo app parity (§6). |

### Verification per phase
- Screenshot every hero route before/after (both themes, 3 widths) and attach to
  the PR.
- `pnpm test` + `pnpm lint` green (lint covers `mobile/` too — see memory).
- Speed Insights delta check on the hero routes.
- Manual keyboard-only pass on any surface the phase touched.

## 8. Non-goals / guardrails

- No new color hues; no move off Google's brand hex (settled — see memory
  `feedback_palette_google_hex`).
- No `data-theme` / logo-pairing changes (settled twice by user direction).
- No fourth button variant, no second icon library, no per-component motion
  tuning (`DESIGN_CONSISTENCY.md`).
- No schema or route changes (the styleguide route is dev-gated and excluded from
  sitemap/robots).
- Don't regress the Aug 2026 perf pass: Suspense streaming boundaries, deferred
  Sentry, `cache()` dedupe, 44px coarse-pointer targets all stay.
- Keep `instrumentation.ts` in `src/` (settled — see memory).
