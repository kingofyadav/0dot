import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getParticipant, markConversationRead } from "@/lib/messaging";
import { revalidatePath } from "next/cache";

// Stays under messages:read rather than getting its own scope — marking a
// conversation read is a state change on the reader's own read receipt,
// not new message access, the identical reasoning notifications:read
// already applies to "marking a notification read" (oauth.ts's own
// comment on that scope).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { id: conversationId } = await params;
  const participant = await getParticipant(conversationId, ctx.userId);
  if (!participant) return apiError("Conversation not found.", 404);

  await markConversationRead(conversationId, ctx.userId);
  revalidatePath("/messages");

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
