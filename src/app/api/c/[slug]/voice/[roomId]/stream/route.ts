import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { subscribeToVoiceRoom, type VoiceRoomEvent } from "@/lib/voice-signal-events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000; // keeps the connection alive through idle proxies/load balancers

// Per-room, per-user SSE stream — same shape as the other two stream
// routes, but participant-gated rather than visibility-gated (unlike
// chat's stream, which allows anonymous viewing of a public community):
// this channel carries WebRTC signaling payloads that reveal real network
// info (ICE candidates), so only current room participants may subscribe
// at all, regardless of the community's visibility.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; roomId: string }> }
) {
  const { roomId } = await params;

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const participant = await db.voiceRoomParticipant.findUnique({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
  });
  if (!participant) return new Response("Unauthorized", { status: 401 });

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: VoiceRoomEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribeToVoiceRoom(roomId, user.id, send);
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
