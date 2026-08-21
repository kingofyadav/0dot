import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCommunityMember, logMembershipEvent } from "@/lib/communities";
import { isEligibleForOrgRestrictedCommunity } from "@/lib/organizations";
import { revalidatePath } from "next/cache";

// Mirrors actions/communities.ts's joinCommunity exactly (same rate-limit
// key, same "any existing row blocks a fresh join" idempotency, same
// public-instant/restricted-or-private-pending status rule) — duplicated
// rather than imported for the same "use server" boundary reason every
// other v1 route in this codebase gives.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  if (!checkRateLimit(`community:join:user:${ctx.userId}`, { max: 30, windowMs: 5 * 60 * 1000 })) {
    return apiError("You're joining communities too fast. Please slow down.", 429);
  }

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const community = await db.community.findUnique({ where: { slug } });
  if (!community) return apiError("Not found.", 404);

  const existing = await getCommunityMember(community.id, ctx.userId);
  if (existing) return apiError("You're already a member (or awaiting approval).", 409);

  if (!(await isEligibleForOrgRestrictedCommunity(community.restrictedToOrganizationId, ctx.userId))) {
    return apiError("You can't join this community.", 403);
  }

  const status = community.visibility === "public" ? "active" : "pending";
  await db.communityMember.create({ data: { communityId: community.id, userId: ctx.userId, role: "member", status } });
  if (status === "active") {
    await db.community.update({ where: { id: community.id }, data: { memberCount: { increment: 1 } } });
    await logMembershipEvent({ communityId: community.id, userId: ctx.userId, type: "join" });
  }

  revalidatePath(`/c/${community.slug}`);

  return Response.json(
    { status },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Mirrors leaveCommunity: the owner can never leave (must transferOwnership
// first, a deliberate web-only action) and a banned member can't "leave"
// their way out of a ban — both silently no-op here too, matching that
// action's own posture rather than surfacing a confusing error for an edge
// case that shouldn't be reachable from the mobile UI anyway (no leave
// button is ever shown to an owner or a banned member).
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const community = await db.community.findUnique({ where: { slug } });
  if (!community) return apiError("Not found.", 404);

  const member = await getCommunityMember(community.id, ctx.userId);
  if (member && member.role !== "owner" && member.status !== "banned") {
    await db.communityMember.delete({ where: { communityId_userId: { communityId: community.id, userId: ctx.userId } } });
    if (member.status === "active" || member.status === "muted") {
      await db.community.update({ where: { id: community.id }, data: { memberCount: { decrement: 1 } } });
      await logMembershipEvent({ communityId: community.id, userId: ctx.userId, type: "leave" });
    }
  }

  revalidatePath(`/c/${community.slug}`);

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
