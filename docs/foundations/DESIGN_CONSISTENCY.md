# Design Consistency

Status: Foundational document (Priority 12). One visual language, enforced. Users should never have to relearn the interface as new features ship.

## Rules

- **Consistent spacing** — governed by the spacing scale in `DESIGN_SYSTEM.md` once formalized; until then, new spacing values should visually match the existing rem values already in use rather than introducing an arbitrary new one.
- **Consistent button styles** — exactly three variants exist (`.button`, `.buttonSecondary`, `.iconButton`). A fourth variant is not created without updating `DESIGN_SYSTEM.md` first — if an existing variant doesn't fit, that's a signal to reconsider the UI, not to add a one-off style.
- **Consistent iconography** — `lucide-react` is the established icon set (used across ~70 files today, e.g. `ArrowLeft`/`ArrowUpRight` in `AuthTopBar`/`ExploreLiveLink`, `UserRound`/`Link2`/`Newspaper`/`Users`/`Briefcase`/`Store` in `DigitalHomeVisual`, `CircleCheck`/`CircleX`/`CircleAlert`/`LoaderCircle` in `UsernameField`). Reach for it rather than a Unicode glyph or a new library — no ad hoc icon characters remain in current UI.
- **Consistent animation** — see Motion section of `DESIGN_SYSTEM.md`; the same duration/easing tokens everywhere, not per-component tuning.
- **Consistent empty states** — see `COMPONENT_LIBRARY.md`'s flagged gap (currently hand-written `<p className="mutedText">` per page); should become one shared component.
- **Consistent terminology** — "Log out" (not "Sign out"), "displayName" surfaced to users as "Name", username surfaced as "Username" consistently across signup/login/profile. Keep a running eye on this as more forms are added — don't let one form say "Display name" and another say "Name" for the same field.

## Known Inconsistency To Fix (partly addressed)

The inline-`style={{...}}`-for-layout crack this section flagged is now partly closed:

- **`.stack` / `.stack-sm` / `.stack-lg` / `.row` / `.row-sm` / `.row-lg` utility classes exist in `globals.css`** — the "any layout pattern used more than once becomes a utility class" rule below was implemented.
- `SiteHeader.tsx` is down to a single inline `style` object.
- **`src/app/[username]/page.tsx` still has ~46 inline `style` objects** — the profile page is the remaining concentration of this debt. Migrate opportunistically when touching it; don't do a wholesale retrofit as a side effect of an unrelated change.
- **Rule going forward:** reach for `.stack`/`.row` (or add a new named utility) rather than a repeated inline style object.

## Rule

Before adding a new visual pattern (a new card style, a new button treatment, a new spacing value), check whether an existing pattern already solves the problem. The bar for "this needs something new" is high — most UI needs are already covered by the current system's small, deliberate vocabulary.
