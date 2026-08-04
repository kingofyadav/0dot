import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hasTierAccess } from "@/lib/tier-access";
import { subscribeToLivestreamChat, type LivestreamChatEvent } from "@/lib/livestream-chat-events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

// Same shape as /api/c/[slug]/chat/stream — reading the live stream follows
// the same gate sendChatMessage applies to sending (spec §8.3's second
// criterion extended to viewing: no point streaming gated chat to someone
// who can't post in it either).
export async function GET(_request: Request, { params }: { params: Promise<{ livestreamId: string }> }) {
  const { livestreamId } = await params;

  const livestream = await db.livestream.findUnique({ where: { id: livestreamId } });
  if (!livestream) return new Response("Not found", { status: 404 });

  if (livestream.requiredTierId) {
    const user = await getCurrentUser();
    const hasAccess = await hasTierAccess(user?.id ?? null, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return new Response("Unauthorized", { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: LivestreamChatEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToLivestreamChat(livestreamId, send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
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
