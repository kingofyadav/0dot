import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasTierAccess } from "@/lib/tier-access";
import { createLiveKitToken } from "@/lib/livestream-provider";

// Bearer-token counterpart to requestViewerToken (src/app/actions/
// livestreams.ts) — same re-checks (status==="live", hasTierAccess), minus
// its anonymous-viewer branch: a bearer-authenticated caller always has a
// real ctx.userId, so there's no anon identity to fall back to here.
// canPublish is always false — the broadcaster's own token (requestBroadcastToken)
// has no bearer-API equivalent; broadcasting stays web-only.
export async function POST(request: Request, { params }: { params: Promise<{ livestreamId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "livestreams:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { livestreamId } = await params;
  const livestream = await db.livestream.findUnique({ where: { id: livestreamId } });
  if (!livestream || livestream.status !== "live") return apiError("This livestream isn't live.", 400);

  if (livestream.requiredTierId) {
    const hasAccess = await hasTierAccess(ctx.userId, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return apiError("You don't have access to this livestream.", 403);
  }

  const result = await createLiveKitToken({
    roomName: livestream.playbackUrl,
    identity: ctx.userId,
    canPublish: false,
  });
  if (!result) return apiError("Playback isn't configured yet.", 503);

  return Response.json(result, {
    headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}
