import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasTierAccess } from "@/lib/tier-access";

// Bearer-token counterpart to src/app/live/[livestreamId]/page.tsx's own
// data fetch — mirrors its status/access branching so a mobile client can
// render the same scheduled/live/ended + gated/ungated states natively.
// `ingestKey` is deliberately never selected/returned here (schema.prisma's
// own comment on that column: "never exposed in a viewer-facing response").
export async function GET(request: Request, { params }: { params: Promise<{ livestreamId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "livestreams:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { livestreamId } = await params;
  const livestream = await db.livestream.findUnique({
    where: { id: livestreamId },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
      startedAt: true,
      endedAt: true,
      requiredTierId: true,
      creatorId: true,
      creator: { include: { username: true, profile: true } },
    },
  });
  if (!livestream) return apiError("Not found.", 404);

  const hasAccess = livestream.requiredTierId
    ? await hasTierAccess(ctx.userId, livestream.creatorId, livestream.requiredTierId)
    : true;

  return Response.json(
    {
      id: livestream.id,
      title: livestream.title,
      status: livestream.status,
      scheduledAt: livestream.scheduledAt,
      startedAt: livestream.startedAt,
      endedAt: livestream.endedAt,
      hasAccess,
      creator: {
        username: livestream.creator.username?.handle ?? null,
        displayName: livestream.creator.profile?.displayName ?? null,
        avatarUrl: livestream.creator.profile?.avatarUrl ?? null,
      },
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
