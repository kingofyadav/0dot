import { getCurrentUser } from "@/lib/session";
import { getUnreadConversationCount } from "@/lib/messaging";
import { getUnreadNotificationCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Polled by MessagingProvider whenever its SSE stream fires, so the tab
// favicon/title badge (BrowserTabProvider) reflects the same authoritative
// counts the header bell/envelope badges already show — no separate
// client-side tally to keep in sync with the DB.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ count: 0 });

  const [conversations, notifications] = await Promise.all([
    getUnreadConversationCount(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return Response.json({ count: conversations + notifications });
}
