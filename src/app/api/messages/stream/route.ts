import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { subscribeToUser, publishToUsers, type MessageEvent } from "@/lib/message-events";
import { getConversationPartnerIds } from "@/lib/messaging";
import { markUserOnline, markUserOffline, refreshPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";
// Matches the platform's default function timeout, made explicit rather
// than implicit — Vercel kills this connection at this ceiling regardless
// (Task timed out after 300 seconds), so this documents the recycle
// cadence the presence grace period (see markUserOffline) is tuned around.
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000; // keeps the connection alive through idle proxies/load balancers
// Proactively recycle before Vercel's maxDuration ceiling kills the
// function mid-stream — that shows up in logs as a timeout error instead of
// a clean close. Ending the response body normally here makes the
// browser's native EventSource reconnect on its own (per spec, any
// connection close it didn't initiate itself triggers a retry after the
// `retry:` delay already set below), so no client-side change is needed.
const STREAM_RECYCLE_MS = 280_000;

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
  let connectionId: string | undefined;
  let closed = false;

  // Shared by the proactive recycle path and cancel() (client disconnects,
  // tab closes) — guarded so whichever fires first is the only one that
  // unsubscribes/marks offline.
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
    if (connectionId) markUserOffline(user.id, connectionId, () => broadcastPresence(user.id, false));
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      // Tunes the browser's built-in reconnect delay explicitly (default is
      // ~3s) instead of leaving it implicit — comfortably inside
      // markUserOffline's PRESENCE_OFFLINE_GRACE_MS so a maxDuration recycle
      // reconnects well before the grace period would broadcast offline.
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      const send = (event: MessageEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToUser(user.id, send);
      connectionId = markUserOnline(user.id);
      heartbeat = setInterval(() => {
        if (Date.now() - startedAt >= STREAM_RECYCLE_MS) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        // Push this connection's presence expiry forward (Redis store) so a
        // long-lived stream doesn't age out as offline.
        if (connectionId) refreshPresence(user.id, connectionId);
      }, HEARTBEAT_MS);

      db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
      broadcastPresence(user.id, true);
    },
    cancel() {
      cleanup();
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
