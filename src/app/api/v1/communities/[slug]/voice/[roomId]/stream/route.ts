import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { subscribeToVoiceRoom, type VoiceRoomEvent } from "@/lib/voice-room-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000;

// Realtime addendum Phase D3 — bearer-token counterpart to
// api/c/[slug]/voice/[roomId]/stream. Carries only `{type:"room-updated"}`
// (audio is on LiveKit). Participant-gated, like the cookie route.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; roomId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { roomId } = await params;
  const participant = await db.voiceRoomParticipant.findUnique({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: ctx.userId } },
  });
  if (!participant) return apiError("Join the room first.", 403);

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      const send = (event: VoiceRoomEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      unsubscribe = subscribeToVoiceRoom(roomId, send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat\n\n`)), HEARTBEAT_MS);
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
