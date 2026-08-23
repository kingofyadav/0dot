import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { subscribeToCommunityChat, type CommunityChatEvent } from "@/lib/community-chat-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // same as api/messages/stream/route.ts — see its comment

const HEARTBEAT_MS = 20_000; // keeps the connection alive through idle proxies/load balancers

// Per-community SSE stream — same shape as /api/messages/stream, room-keyed
// instead of user-keyed (see community-chat-events.ts). Viewing follows the
// same visibility rule as the chat history itself (spec §3.1/§17.1):
// public/restricted communities' chat is viewable by anyone, private only
// by members. Sending is checked separately, server-side, in sendChatMessage
// (src/app/actions/community-chat.ts) — this route only gates reading the
// live stream.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, visibility: true, restrictedToOrganizationId: true },
  });
  if (!community) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  const membership = user ? await getCommunityMember(community.id, user.id) : null;
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      const send = (event: CommunityChatEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToCommunityChat(community.id, send);
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
