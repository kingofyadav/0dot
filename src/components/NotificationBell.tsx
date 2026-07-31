import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getUnreadNotificationCount } from "@/lib/notifications";

// A link, not a popover — links straight to the full /notifications page.
// No client JS needed (it's not a toggle), so this stays a plain async
// Server Component like the rest of the header.
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;

  const count = await getUnreadNotificationCount(user.id);
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";

  return (
    <Link href="/notifications" className="notificationBell" aria-label={label}>
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="notificationBellBadge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
