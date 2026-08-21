import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const community = await db.community.findUnique({ where: { slug } });
  if (!community) return apiError("Not found.", 404);

  const membership = await getCommunityMember(community.id, ctx.userId);
  const isActiveMember = membership?.status === "active";
  const canViewContent = !isGatedFromCommunityContent(community, isActiveMember);

  return Response.json(
    {
      slug: community.slug,
      name: community.name,
      description: community.description,
      avatarUrl: community.avatarUrl,
      coverUrl: community.coverUrl,
      visibility: community.visibility,
      memberCount: community.memberCount,
      canViewContent,
      membership: membership ? { role: membership.role, status: membership.status } : null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
