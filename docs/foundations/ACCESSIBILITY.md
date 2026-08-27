# Accessibility

Status: Foundational document (Priority 10). Per `VISION.md`'s Core Principles, accessibility is a standing requirement on every feature, not a Phase 11 AI add-on (Phase 11's AI-generated alt-text/captions are an *enhancement* on top of this baseline, not a substitute for it — see `docs/specs/roadmap-audit.md` §2.5, which flagged this exact conflation as a gap in the original roadmap and closed it as a standing requirement in `phase-1-foundation.md` §7.3).

## Standard

Target **WCAG 2.1 AA** as the baseline for every shipped feature, not an eventual retrofit.

## Current State (honest audit)

- **Keyboard navigation:** native elements (`<button>`, `<a>`, `<input>`, `<details>`, and now `<dialog>` for `Modal.tsx`) are used throughout rather than custom-built interactive `<div>`s. `Modal`'s focus trap/Escape/focus-return come from the platform via `showModal()`, not hand-rolled JS. Still no exhaustive tab-order audit across every page.
- **Screen readers:** `aria-pressed` on the like button, `aria-label` on icon buttons. Skip-to-content link exists (`.skipLink` in `globals.css`, wired in `layout.tsx`, targets `#main-content`). `Toast.tsx`'s stack is an `aria-live="polite"` region — now exercised in production via `ReportButton.tsx`'s `useToast()` call. `UsernameField`'s live availability status (`checking`/`available`/`taken`/…) is announced the same way (`aria-live="polite"` on the status `<span>`), not just conveyed visually. `DigitalHomeVisual` deliberately isn't `role="img"` despite being visually decorative — it contains real focusable `<a>`/`<button>` nodes, and `role="img"` on a container with interactive descendants can make assistive tech flatten or skip them.
- **Focus indicators:** implemented globally — `a:focus-visible`, `button:focus-visible`, `summary:focus-visible`, `[tabindex]:focus-visible` all get a consistent 2px `var(--accent)` outline (`globals.css`), not just inputs. Verified in Chrome that Tab reveals the skip link first, then a clearly visible ring on form buttons.
- **Color contrast:** the palette was rebranded to Google's 4-color system (2026-08, see `DESIGN_SYSTEM.md`); that rebrand did its `--on-accent`/`--on-success`/`--on-warning`/`--on-danger` contrast checks up front (near-black text: Blue 5.0:1, Green 5.9:1, Red 4.6:1, Yellow 10.5:1). `--warning` (Yellow) is documented as **never** valid as bare colored text — filled badge / icon / border only. Still not exhaustively audited: `--accent` used as small *text* (links-as-actions, meta emphasis) rather than as a button background, and the verified badge glyph, across both themes.
- **Text size / zoom:** no explicit handling either way — relative units (`rem`) are used throughout, which is the right foundation for respecting user font-size preferences, but browser zoom/text-resize hasn't been tested.
- **Reduced motion:** implemented — a blanket `@media (prefers-reduced-motion: reduce)` override in `globals.css` zeroes animation/transition duration and disables smooth scroll for every element, in addition to entrance animations (`.authCard`, `.modal`, `.toast`) already individually wrapping themselves in `@media (prefers-reduced-motion: no-preference)`.
- **High contrast mode:** not tested.

## Checklist (apply to every new feature)

- [ ] All interactive elements reachable and operable by keyboard alone
- [ ] Visible focus indicator on every interactive element (not just inputs)
- [ ] Every icon-only control has an `aria-label`
- [ ] Every image has meaningful `alt` text (or `alt=""` if purely decorative)
- [ ] Color is never the only signal (e.g. error states pair color with text/icon, not red alone)
- [ ] Text contrast checked against both light and dark theme tokens
- [ ] Touch targets ≥ 44×44px (shared with `UX_GUIDELINES.md` #4)
- [ ] No content or functionality relies on hover alone (must also work on touch/keyboard focus)
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Form errors are associated with their field programmatically, not just visually adjacent

## Rule

Accessibility issues found during review are treated as bugs, not backlog items — fixed before merge, same as a functional bug, consistent with `VISION.md`'s framing of accessibility as a Core Principle rather than a feature.
