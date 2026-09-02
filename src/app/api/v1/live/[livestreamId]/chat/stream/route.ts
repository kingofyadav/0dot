import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasTierAccess } from "@/lib/tier-access";
import { subscribeToLivestreamChat, type LivestreamChatEvent } from "@/lib/livestream-chat-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000;
// Proactively recycle before Vercel's maxDuration ceiling kills the
// function mid-stream (see api/messages/stream/route.ts's comment) —
// ending the response body normally makes a reconnecting client's next
// GET .../chat/stream pick up cleanly.
const STREAM_RECYCLE_MS = 280_000;

// Bearer-token counterpart to api/live/[livestreamId]/chat/stream — same
// signal-only shape (livestream-chat-events.ts's events carry no payload
// or seq, unlike community-chat-events.ts's Phase-C-upgraded ones), so
// there's no Last-Event-ID replay here: a reconnecting client just calls
// GET .../chat again for the current recent-messages page, same as the web
// LivestreamChatView's router.refresh() does on every event already.
export async function GET(request: Request, { params }: { params: Promise<{ livestreamId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "livestreams:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { livestreamId } = await params;
  const livestream = await db.livestream.findUnique({
    where: { id: livestreamId },
    select: { id: true, creatorId: true, requiredTierId: true },
  });
  if (!livestream) return apiError("Not found.", 404);

  if (livestream.requiredTierId) {
    const hasAccess = await hasTierAccess(ctx.userId, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return apiError("You don't have access to this livestream's chat.", 403);
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      const send = (event: LivestreamChatEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToLivestreamChat(livestreamId, send);
      heartbeat = setInterval(() => {
        if (Date.now() - startedAt >= STREAM_RECYCLE_MS) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_MS);
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
