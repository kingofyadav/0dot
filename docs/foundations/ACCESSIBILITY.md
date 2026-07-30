# Accessibility

Status: Foundational document (Priority 10). Per `VISION.md`'s Core Principles, accessibility is a standing requirement on every feature, not a Phase 11 AI add-on (Phase 11's AI-generated alt-text/captions are an *enhancement* on top of this baseline, not a substitute for it — see `docs/specs/roadmap-audit.md` §2.5, which flagged this exact conflation as a gap in the original roadmap and closed it as a standing requirement in `phase-1-foundation.md` §7.3).

## Standard

Target **WCAG 2.1 AA** as the baseline for every shipped feature, not an eventual retrofit.

## Current State (honest audit)

- **Keyboard navigation:** not explicitly tested anywhere. Native elements (`<button>`, `<a>`, `<input>`, `<details>`) are used throughout rather than custom-built interactive `<div>`s, which is the right foundation — but no explicit tab-order or keyboard-trap testing has been done on any page.
- **Screen readers:** partial. `aria-pressed` is already correctly used on the like button (a real, good pattern — reuse it for any other toggle button). `aria-label` is used on the icon reorder/delete buttons (`"Move up"`, `"Move down"`, `"Delete"`). No skip-to-content link exists. No live-region announcements for async updates (e.g. a post being liked doesn't announce the new count to a screen reader beyond the button's own label re-render).
- **Focus indicators:** inputs have a visible focus ring (`box-shadow: 0 0 0 3px var(--accent-soft)` on focus) — good. Buttons and links do not have an explicit custom focus style, relying on browser default outline, which may be visually inconsistent with the rest of the design system. Needs an explicit, consistent focus-visible treatment across all interactive elements, not just inputs.
- **Color contrast:** not formally checked against WCAG AA thresholds for either light or dark token set. The saffron accent (`#ff9933` light / `#ffb35c` dark) on white/near-black backgrounds is likely fine for large text/UI elements but should be explicitly verified for smaller text uses before relying on it for body copy.
- **Text size / zoom:** no explicit handling either way — relative units (`rem`) are used throughout, which is the right foundation for respecting user font-size preferences, but browser zoom/text-resize hasn't been tested.
- **Reduced motion:** `prefers-reduced-motion` is not handled anywhere. Current motion is minimal (short hover/press transitions) so the risk is low today, but this should be added as a blanket rule (`@media (prefers-reduced-motion: reduce) { * { transition-duration: 0.01ms !important; } }`-style override) before any entrance/exit animation (modals, toasts — see `COMPONENT_LIBRARY.md`) is built.
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
