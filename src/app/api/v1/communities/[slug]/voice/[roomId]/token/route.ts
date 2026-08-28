import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { mintTokenForParticipant } from "@/lib/voice-room-actions";

// Realtime addendum Phase D3 — the LiveKit join token for a room the caller
// is already a participant of (POST …/action { action: "join" } first).
// Same guards as the web `requestVoiceRoomToken` action, via the shared
// voice-room-actions helper. `communities:write` — this is an active
// participation action, not a read.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; roomId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { roomId } = await params;
  const result = await mintTokenForParticipant(ctx.userId, roomId);
  if ("error" in result) return apiError(result.error, 403);
  return Response.json(result);
}
