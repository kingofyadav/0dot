import { getCurrentUser } from "@/lib/session";
import { subscribeToUser, type MessageEvent } from "@/lib/message-events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000; // keeps the connection alive through idle proxies/load balancers

// Per-user SSE stream. The payload content doesn't matter to the client
// (MessagingProvider just triggers a router.refresh() on any event, letting
// the normal Server Component tree — inbox list, unread badge, open
// conversation — re-render with authoritative data instead of hand-rolled
// client-side patching) — but real event data is still sent for future
// consumers and easier debugging.
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
