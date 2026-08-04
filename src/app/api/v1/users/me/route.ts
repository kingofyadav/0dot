import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Representative /v1 endpoint (phase-10 spec §5.1/§5.2): every route in
// this API resolves the bearer token via resolveApiRequest, checks the
// rate limit, then reads through the same tables/fields the web UI itself
// reads — no parallel serialization layer that could drift from what
// getCurrentUser()-backed pages already show a signed-in user about
// themselves.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    include: { username: true, profile: true },
  });
  if (!user) return apiError("Not found.", 404);

  return Response.json(
    {
      id: user.id,
      username: user.username?.handle ?? null,
      displayName: user.profile?.displayName ?? null,
      bio: user.profile?.bio ?? null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
