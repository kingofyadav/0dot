// Redesign Phase 0 (docs/specs/phase-0-redesign.md §4.5 / D9).
//
// lucide-react is the established icon set (~70 files), but call sites pass ad
// hoc sizes (14, 16, 40) and never set strokeWidth, so icons render at
// inconsistent weights. This wrapper is the one place the convention lives:
//
//   sm = 16  inline with text, meta rows, dense badges
//   md = 20  buttons, list rows, form controls   (default)
//   lg = 24  primary nav, page headers
//
// strokeWidth 1.75 everywhere — lucide's default 2 reads heavy at 16-20px on
// this app's near-neutral surfaces; 1.75 keeps them crisp without frail.
//
// Usage:  <Icon as={Bell} />           <Icon as={Search} size="lg" />
// Decorative by default (aria-hidden); pass `label` for a standalone icon that
// conveys meaning on its own (rare — most icons sit next to a text label).

import type { LucideIcon } from "lucide-react";

export const ICON_SIZE = { sm: 16, md: 20, lg: 24 } as const;
export const ICON_STROKE = 1.75;

export type IconSize = keyof typeof ICON_SIZE;

export function Icon({
  as: Component,
  size = "md",
  label,
  className,
  strokeWidth = ICON_STROKE,
}: {
  as: LucideIcon;
  size?: IconSize;
  /** Accessible name for an icon used without an adjacent text label. */
  label?: string;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Component
      size={ICON_SIZE[size]}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
