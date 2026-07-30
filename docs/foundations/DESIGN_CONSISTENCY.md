# Design Consistency

Status: Foundational document (Priority 12). One visual language, enforced. Users should never have to relearn the interface as new features ship.

## Rules

- **Consistent spacing** — governed by the spacing scale in `DESIGN_SYSTEM.md` once formalized; until then, new spacing values should visually match the existing rem values already in use rather than introducing an arbitrary new one.
- **Consistent button styles** — exactly three variants exist (`.button`, `.buttonSecondary`, `.iconButton`). A fourth variant is not created without updating `DESIGN_SYSTEM.md` first — if an existing variant doesn't fit, that's a signal to reconsider the UI, not to add a one-off style.
- **Consistent iconography** — no icon set is in use yet (current UI uses Unicode glyphs: `↑` `↓` `✕` for link reorder/delete, `♥` for like). Before a fourth or fifth icon is needed, pick one real icon library/style rather than continuing with ad hoc Unicode characters, which don't render identically across platforms/fonts.
- **Consistent animation** — see Motion section of `DESIGN_SYSTEM.md`; the same duration/easing tokens everywhere, not per-component tuning.
- **Consistent empty states** — see `COMPONENT_LIBRARY.md`'s flagged gap (currently hand-written `<p className="mutedText">` per page); should become one shared component.
- **Consistent terminology** — "Log out" (not "Sign out"), "displayName" surfaced to users as "Name", username surfaced as "Username" consistently across signup/login/profile. Keep a running eye on this as more forms are added — don't let one form say "Display name" and another say "Name" for the same field.

## Known Inconsistency To Fix (flagged honestly, not yet fixed)

`SiteHeader.tsx` and `[username]/page.tsx` both use inline `style={{...}}` objects for layout (flex containers, gaps, margins) instead of shared CSS classes, while `globals.css` otherwise maintains a clean class-based system for everything else (`.button`, `.field`, `.profileCard`, etc.). This is the first real crack in "one visual language" in the current codebase:

- It works today only because the app is small enough that inconsistency hasn't caused a visible bug yet.
- It means the same layout pattern (e.g. `display: flex; alignItems: center; gap: X`) is duplicated as inline objects in multiple places instead of being named once.
- **Rule going forward:** any layout pattern used more than once becomes a utility class (e.g. `.row`, `.stack`, `.stack-sm`) in `globals.css` rather than a repeated inline style object. Existing inline styles don't need an urgent retrofit, but should be migrated opportunistically whenever a file with them is touched for an unrelated change — not left to accumulate further.

## Rule

Before adding a new visual pattern (a new card style, a new button treatment, a new spacing value), check whether an existing pattern already solves the problem. The bar for "this needs something new" is high — most UI needs are already covered by the current system's small, deliberate vocabulary.
