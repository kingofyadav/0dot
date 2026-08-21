import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Mobile pro-upgrade addendum, sub-phase M4. Mirrors src/app/c/page.tsx's
// own "your communities" + "discover" two-section shape exactly (that
// page's own comment: "just enough to make step 1 usable... not a search
// experience") — text search across communities lives on
// GET /api/v1/search?type=communities instead, kept separate the same way
// this route's browse view and that route's find-by-name view are already
// separate concerns on web.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const myMemberships = await db.communityMember.findMany({
    where: { userId: ctx.userId, status: "active" },
    orderBy: { joinedAt: "desc" },
    include: { community: true },
  });
  const myCommunityIds = myMemberships.map((m) => m.communityId);

  const recentPublic = await db.community.findMany({
    where: { visibility: "public", id: { notIn: myCommunityIds } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const summarize = (c: { slug: string; name: string; description: string; avatarUrl: string | null; memberCount: number; visibility: string }) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    avatarUrl: c.avatarUrl,
    memberCount: c.memberCount,
    visibility: c.visibility,
  });

  return Response.json(
    {
      joined: myMemberships.map((m) => summarize(m.community)),
      discover: recentPublic.map(summarize),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
