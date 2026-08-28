import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { subscribeToUser, publishToUsers, type MessageEvent } from "@/lib/message-events";
import { getConversationPartnerIds } from "@/lib/messaging";
import { markUserOnline, markUserOffline, refreshPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // same as api/messages/stream/route.ts — see its comment

const HEARTBEAT_MS = 20_000; // same idle-proxy-friendly interval api/messages/stream/route.ts uses

// Mobile pro-upgrade addendum M10: the bearer-token counterpart to
// api/messages/stream/route.ts, subscribing to the exact same in-memory
// event bus (message-events.ts) rather than a second one — that bus is
// already keyed by userId with no notion of *how* a subscriber
// authenticated, so nothing on the publish side (recordMessageAndNotify,
// messaging.ts) needed to change for this to work. Built once, as shared
// infra, per the addendum's own M3-deferred design: this replaces
// app/messages/[id].tsx's 5s poll, and is the same connection community
// chat (a future sub-phase) builds on next.
function broadcastPresence(userId: string, online: boolean): void {
  getConversationPartnerIds(userId)
    .then((partnerIds) => publishToUsers(partnerIds, { type: "presence", userId, online }))
    .catch(() => {});
}

export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  // Checked once at connection-open, matching every other v1 route's
  // per-request check — not re-checked per heartbeat, since this is one
  // long-lived connection, not a request stream.
  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const userId = ctx.userId;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let connectionId: string | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      const send = (event: MessageEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToUser(userId, send);
      connectionId = markUserOnline(userId);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        if (connectionId) refreshPresence(userId, connectionId);
      }, HEARTBEAT_MS);

      db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
      broadcastPresence(userId, true);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);

      db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
      if (connectionId) markUserOffline(userId, connectionId, () => broadcastPresence(userId, false));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
    },
  });
}
