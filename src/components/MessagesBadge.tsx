import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getUnreadConversationCount } from "@/lib/messaging";

// Server-rendered initial count, same SSR-then-live pattern as
// NotificationBell — MessagingProvider's SSE-triggered router.refresh()
// (see that component) re-renders this on any message event, so the count
// updates live without this component doing any client work of its own.
export async function MessagesBadge() {
  const user = await getCurrentUser();
  if (!user) return null;

  const count = await getUnreadConversationCount(user.id);
  const label = count > 0 ? `Messages, ${count} unread` : "Messages";

  return (
    <Link href="/messages" className="notificationBell" aria-label={label}>
      <span aria-hidden="true">✉️</span>
      {count > 0 && (
        <span className="notificationBellBadge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
