import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBusinessStaff } from "@/lib/businesses";
import { subscribeToBusinessViewers, countViewers } from "@/lib/business-viewers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000;
// Proactively recycle before Vercel's maxDuration ceiling kills the
// function mid-stream — the client's EventSource reconnects on its own,
// picking up with a fresh `retry`/initial count, so this is a clean
// close rather than a hard timeout error in the logs.
const STREAM_RECYCLE_MS = 280_000;

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
  if (!user || !(await isBusinessStaff(business.id, user.id))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  // Set immediately by cancel(), even before unsubscribe/heartbeat exist —
  // start() is async and awaits countViewers() (a DB/Redis round trip)
  // before those refs are assigned, so a disconnect during that await used
  // to make cancel() a no-op and let the pending enqueue() below run
  // against an already-cancelled controller, throwing instead of being
  // suppressed.
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      const enqueue = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };
      const send = async () => {
        const count = await countViewers(business.id);
        enqueue(`data: ${JSON.stringify({ count })}\n\n`);
      };
      enqueue(`retry: 2000\n\n`);
      await send();
      if (closed) return; // cancelled during the awaits above — don't set up listeners cancel() already ran without

      // Coalesce a burst of joins/leaves into one recompute.
      unsubscribe = subscribeToBusinessViewers(business.id, () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = undefined;
          void send();
        }, 500);
      });
      heartbeat = setInterval(() => {
        if (Date.now() - startedAt >= STREAM_RECYCLE_MS) {
          closed = true;
          unsubscribe?.();
          if (heartbeat) clearInterval(heartbeat);
          if (pending) clearTimeout(pending);
          controller.close();
          return;
        }
        enqueue(`: heartbeat\n\n`);
      }, HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
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
