"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/EmptyState";

// Generic popover shell shared by NotificationBell and MessagesBadge — both
// need the same open/close/trigger/footer chrome around a different list of
// already-existing row components (railNotificationItem-style rows,
// ConversationListItem). Deliberately just a shell: the caller renders its
// own rows as children, this component owns none of that markup.
export function PreviewPopover({
  trigger,
  title,
  viewAllHref,
  viewAllLabel = "View all",
  isEmpty,
  emptyLabel,
  children,
}: {
  trigger: ReactNode;
  title: string;
  viewAllHref: string;
  viewAllLabel?: string;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
        </PopoverHeader>
        {isEmpty ? (
          <EmptyState message={emptyLabel} />
        ) : (
          <div className="previewMenuList">{children}</div>
        )}
        <Link href={viewAllHref} className="previewMenuFooter">
          {viewAllLabel}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
