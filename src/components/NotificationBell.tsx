import Link from "next/link";
import { Bell, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getUnreadNotificationCount, getRecentNotificationsPreview, getNotificationVerb, getNotificationHref } from "@/lib/notifications";
import { PreviewPopover } from "./PreviewPopoverLazy";

const PREVIEW_COUNT = 5;

// A popover preview (not a bare link) — same data/rendering as
// ContextualRail's Notifications section (getRecentNotificationsPreview,
// unaggregated, fine for a 5-item preview), just reachable from every page
// via the header instead of only /feed, /explore, /notifications. Opening
// this never marks anything read — only visiting /notifications does
// (see that page's read-on-view contract) — so the count badge here stays
// accurate until the user actually goes look.
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [count, notifications] = await Promise.all([
    getUnreadNotificationCount(user.id),
    getRecentNotificationsPreview(user.id, PREVIEW_COUNT),
  ]);
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  const recipientHandle = user.username?.handle ?? null;

  return (
    <PreviewPopover
      trigger={
        <button type="button" className="notificationBell" aria-label={label}>
          <Bell size={20} aria-hidden="true" />
          {count > 0 && (
            <span className="notificationBellBadge" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      }
      title="Notifications"
      viewAllHref="/notifications"
      isEmpty={notifications.length === 0}
      emptyLabel="Nothing yet."
    >
      {notifications.map((n) => (
        <Link key={n.id} href={getNotificationHref(n, recipientHandle)} className="railNotificationItem" style={{ display: "block", background: n.readAt === null ? "var(--accent-soft)" : undefined }}>
          <strong>{n.actor?.profile?.displayName ?? "Someone"}</strong>
          {n.actor?.profile?.isVerified && (
            <span className="verifiedBadge" title="Verified" aria-label="Verified">
              <BadgeCheck size={14} aria-hidden="true" />
            </span>
          )}{" "}
          {getNotificationVerb(n.type, n.subjectType)}
        </Link>
      ))}
    </PreviewPopover>
  );
}
