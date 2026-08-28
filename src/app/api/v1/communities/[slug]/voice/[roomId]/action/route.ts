import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import * as voice from "@/lib/voice-room-actions";
import type { VoiceActionResult } from "@/lib/voice-room-actions";

// Realtime addendum Phase D3 — one route for every voice-room floor
// transition the mobile screen drives. Each dispatches to the shared
// voice-room-actions helper (identical guards to the web Server Actions),
// so there's no second copy of the floor logic to keep in sync.
const HANDLERS: Record<string, (userId: string, roomId: string) => Promise<VoiceActionResult>> = {
  join: voice.joinVoiceRoom,
  leave: voice.leaveVoiceRoom,
  "request-speak": voice.requestToSpeak,
  "cancel-request": voice.cancelSpeakRequest,
  "start-speaking": voice.startSpeaking,
  "stop-speaking": voice.stopSpeaking,
  "force-stop": voice.forceStopSpeaker,
  "start-room": voice.startVoiceRoom,
  "end-room": voice.endVoiceRoom,
};

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; roomId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const payload = await request.json().catch(() => null);
  const action = typeof payload?.action === "string" ? payload.action : "";
  const handler = HANDLERS[action];
  if (!handler) return apiError(`Unknown action "${action}".`, 400);

  const { roomId } = await params;
  const result = await handler(ctx.userId, roomId);
  if ("error" in result) return apiError(result.error, 409);
  return Response.json({ ok: true });
}
