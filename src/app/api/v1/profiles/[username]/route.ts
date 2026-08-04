import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

// spec §5.1's acceptance criterion in concrete form: a blocked relationship
// hides the profile from the API exactly as it hides it from the web page
// (see `[username]/page.tsx`'s own isBlocked/viewerBlockedByOwner check) —
// isBlockedEitherWay is the same shared primitive, not a re-derivation of
// its logic.
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username || !username.user.profile) return apiError("Not found.", 404);

  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const profile = username.user.profile;
  return Response.json(
    {
      username: handle,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      isVerified: profile.isVerified,
      followerCount: profile.followerCount,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
