"use client";

import dynamic from "next/dynamic";

// Same reasoning as AccountMenuLazy.tsx: both call sites (NotificationBell,
// MessagesBadge) are Server Components, so the dynamic import has to happen
// in this thin client wrapper for the code-split to actually take effect.
export const PreviewPopover = dynamic(() => import("./PreviewPopover").then((m) => m.PreviewPopover));
