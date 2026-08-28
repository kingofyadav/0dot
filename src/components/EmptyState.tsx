import type { ComponentType, ReactNode } from "react";
import { ICON_SIZE, ICON_STROKE } from "@/components/Icon";

// A designed empty state, not a bare <p> — UX_GUIDELINES.md #10 ("Empty
// states are designed, not blank"). Redesign Phase 1
// (docs/specs/phase-0-redesign.md §5) gave it real hierarchy: an optional
// icon in a soft disc, a foreground title, an optional muted description
// line, and an action slot.
//
// Back-compatible: the original `message` prop still works and renders as the
// title. New call sites should prefer `title` + `description` + `icon`.
export function EmptyState({
  icon: Icon,
  message,
  title,
  description,
  action,
}: {
  /** A lucide icon component, e.g. `Newspaper`. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  /** @deprecated use `title` — kept so existing call sites keep working. */
  message?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const heading = title ?? message;
  return (
    <div className="emptyState">
      {Icon && (
        <span className="emptyStateIcon" aria-hidden="true">
          <Icon size={ICON_SIZE.lg} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
      )}
      {heading && <p className="emptyStateTitle">{heading}</p>}
      {description && <p className="emptyStateBody">{description}</p>}
      {action && <div className="emptyStateAction">{action}</div>}
    </div>
  );
}
