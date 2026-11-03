import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyBusinessFollow } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

// Mirrors actions/businesses.ts's followBusiness/unfollowBusiness — reuses
// the `follows:write` scope (src/lib/oauth.ts) rather than adding a new
// one, same "follow is follow, regardless of subject" posture as the user
// follow route this mirrors. No private/pending branch: a Business has no
// privacy setting to gate on, unlike the /profiles/[username]/follow
// route this one otherwise matches shape-for-shape.

async function resolveActiveBusiness(rawSlug: string) {
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  return db.business.findUnique({ where: { slug } });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "follows:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { slug } = await params;
  const business = await resolveActiveBusiness(slug);
  if (!business || business.status !== "active") return apiError("Not found.", 404);

  if (!checkRateLimit(`business:follow:user:${ctx.userId}`, { max: 30, windowMs: 5 * 60 * 1000 })) {
    return apiError("You're following too fast. Please slow down.", 429);
  }

  const existing = await db.businessFollow.findUnique({
    where: { followerId_businessId: { followerId: ctx.userId, businessId: business.id } },
  });
  if (!existing) {
    await db.$transaction([
      db.businessFollow.create({ data: { followerId: ctx.userId, businessId: business.id } }),
      db.business.update({ where: { id: business.id }, data: { followerCount: { increment: 1 } } }),
    ]);

    const staff = await db.businessMember.findMany({
      where: { businessId: business.id, role: { in: ["owner", "admin"] } },
      select: { userId: true },
    });
    await Promise.all(
      staff.map((m) => notifyBusinessFollow({ recipientId: m.userId, actorId: ctx.userId, businessSlug: business.slug }))
    );

    revalidatePath(`/b/${business.slug}`);
  }

  return Response.json(
    { following: true },
    { status: existing ? 200 : 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "follows:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug } = await params;
  const business = await resolveActiveBusiness(slug);
  if (!business) return apiError("Not found.", 404);

  const existing = await db.businessFollow.findUnique({
    where: { followerId_businessId: { followerId: ctx.userId, businessId: business.id } },
  });
  if (existing) {
    await db.$transaction([
      db.businessFollow.delete({ where: { followerId_businessId: { followerId: ctx.userId, businessId: business.id } } }),
      db.business.update({ where: { id: business.id }, data: { followerCount: { decrement: 1 } } }),
    ]);
    revalidatePath(`/b/${business.slug}`);
  }

  return Response.json(
    { following: false },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
