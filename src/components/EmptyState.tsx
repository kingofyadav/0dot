import type { ReactNode } from "react";

// A designed empty state, not a bare <p> — UX_GUIDELINES.md #10 ("Empty
// states are designed, not blank") and DESIGN_CONSISTENCY.md's flagged gap
// (previously hand-written `<p className="mutedText">` per page).
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="emptyState">
      <p className="mutedText">{message}</p>
      {action}
    </div>
  );
}
