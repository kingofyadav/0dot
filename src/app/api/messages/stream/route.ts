import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { subscribeToUser, publishToUsers, type MessageEvent } from "@/lib/message-events";
import { getConversationPartnerIds } from "@/lib/messaging";
import { markUserOnline, markUserOffline } from "@/lib/presence";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000; // keeps the connection alive through idle proxies/load balancers

// Notifies everyone who shares a conversation with this user that their
// online state changed, so an open inbox/conversation on the other end can
// repaint its green dot without waiting for an unrelated message/notification
// event. Fire-and-forget from start()/cancel() — a slow query here shouldn't
// delay the stream opening or closing.
function broadcastPresence(userId: string, online: boolean): void {
  getConversationPartnerIds(userId)
    .then((partnerIds) => publishToUsers(partnerIds, { type: "presence", userId, online }))
    .catch(() => {});
}

// Per-user SSE stream. The payload content doesn't matter to the client
// (MessagingProvider just triggers a router.refresh() on any event, letting
// the normal Server Component tree — inbox list, unread badge, open
// conversation — re-render with authoritative data instead of hand-rolled
// client-side patching) — but real event data is still sent for future
// consumers and easier debugging.
//
// Also doubles as the presence signal (spec-less, product-requested "green
// dot" feature): MessagingProvider mounts one of these per open tab for the
// whole session, so "has an open stream" is a reasonable proxy for "online"
// — see src/lib/presence.ts for why that's tracked in memory rather than a
// polled DB heartbeat.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: MessageEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToUser(user.id, send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_MS);

      markUserOnline(user.id);
      db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
      broadcastPresence(user.id, true);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);

      const stillOnline = markUserOffline(user.id);
      db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
      if (!stillOnline) broadcastPresence(user.id, false);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
