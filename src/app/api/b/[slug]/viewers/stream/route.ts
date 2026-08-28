import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember } from "@/lib/businesses";
import { subscribeToBusinessViewers, countViewers } from "@/lib/business-viewers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000;

// Realtime addendum Phase E — the owner's live "N viewing now" feed. One
// SSE per owner dashboard (they have it open); each frame is
// `{ count: number }`. Owner-only: a business's own traffic count is not
// public. The viewer beacons (viewers/ping) drive the underlying set;
// this route just recomputes + pushes on a `bizview` broadcast.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await db.business.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true },
  });
  if (!business) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  const membership = user ? await getBusinessMember(business.id, user.id) : null;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = async () => {
        const count = await countViewers(business.id);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ count })}\n\n`));
      };
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      await send();

      // Coalesce a burst of joins/leaves into one recompute.
      unsubscribe = subscribeToBusinessViewers(business.id, () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = undefined;
          void send();
        }, 500);
      });
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat\n\n`)), HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
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
