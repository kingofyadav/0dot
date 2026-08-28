import type { ReactNode } from "react";

// Redesign Phase 1 (docs/specs/phase-0-redesign.md §5). One page-title block
// for the whole app. Supersedes both the ad hoc
// `<h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>` pattern (~64 call
// sites — a large part of why hierarchy reads flat, D2) and the older
// `.pageHeaderRow` + `.pageHeading` pair. Adopted per-route in Phase 2; not
// retrofitted wholesale.
//
//   <PageHeader
//     eyebrow="Communities"
//     title="Find your people"
//     description="Public spaces you can join, plus the ones you already run."
//     actions={<Link href="/c/new" className="button">Create community</Link>}
//   />
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderMain">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="pageHeaderTitle">{title}</h1>
        {description && <p className="pageHeaderDescription">{description}</p>}
      </div>
      {actions && <div className="pageHeaderActions">{actions}</div>}
    </header>
  );
}
