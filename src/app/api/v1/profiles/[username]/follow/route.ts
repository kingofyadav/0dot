import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { notifyNewFollower, notifyFollowRequest } from "@/lib/notifications";
import { recordFollowVelocityAnomaly } from "@/lib/account-risk";
import { revalidatePath } from "next/cache";

// Mirrors actions/follow.ts's revalidateFollowPaths, minus the follower's
// own handle (unknown here without an extra query the mutation logic
// below doesn't otherwise need — the follower's own profile page isn't
// this route's cache-freshness concern the way the followee's is).
function revalidateFolloweePaths(handle: string) {
  revalidatePath("/feed");
  revalidatePath("/explore");
  revalidatePath(`/${handle}`);
  revalidatePath(`/${handle}/followers`);
}

async function resolveFollowee(rawHandle: string) {
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  return db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
}

// Mirrors actions/follow.ts's followUser. Idempotent: following an
// already-followed (or already-requested) account is a no-op success, not
// an error, matching the web action's posture (spec §3.5).
export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "follows:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { username } = await params;
  const followeeUsername = await resolveFollowee(username);
  if (!followeeUsername?.user.profile) return apiError("Not found.", 404);
  const followeeId = followeeUsername.userId;
  if (followeeId === ctx.userId) return apiError("You can't follow yourself.", 400);

  if (!checkRateLimit(`follow:user:${ctx.userId}`, { max: 30, windowMs: 5 * 60 * 1000 })) {
    await recordFollowVelocityAnomaly(ctx.userId);
    return apiError("You're following too fast. Please slow down.", 429);
  }
  if (await isBlockedEitherWay(ctx.userId, followeeId)) return apiError("Not found.", 404);

  const existing = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: ctx.userId, followeeId } } });
  if (existing) {
    return Response.json(
      { status: existing.status },
      { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const isPrivate = followeeUsername.user.profile.isPrivate;
  if (isPrivate) {
    await db.follow.create({ data: { followerId: ctx.userId, followeeId, status: "pending" } });
    await notifyFollowRequest({ recipientId: followeeId, actorId: ctx.userId });
  } else {
    await db.$transaction([
      db.follow.create({ data: { followerId: ctx.userId, followeeId, status: "accepted" } }),
      db.profile.update({ where: { userId: ctx.userId }, data: { followingCount: { increment: 1 } } }),
      db.profile.update({ where: { userId: followeeId }, data: { followerCount: { increment: 1 } } }),
    ]);
    await notifyNewFollower({ recipientId: followeeId, actorId: ctx.userId });
  }

  revalidateFolloweePaths(followeeUsername.handle);

  return Response.json(
    { status: isPrivate ? "pending" : "accepted" },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Mirrors actions/follow.ts's unfollowUser — also cancels a still-pending
// follow request, same shared idempotent "delete the row if it exists"
// shape the web action uses for both cases.
export async function DELETE(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "follows:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username } = await params;
  const followeeUsername = await resolveFollowee(username);
  if (!followeeUsername?.user.profile) return apiError("Not found.", 404);
  const followeeId = followeeUsername.userId;

  const existing = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: ctx.userId, followeeId } } });
  if (!existing) {
    return Response.json(
      { ok: true },
      { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const wasAccepted = existing.status === "accepted";
  await db.$transaction([
    db.follow.delete({ where: { followerId_followeeId: { followerId: ctx.userId, followeeId } } }),
    ...(wasAccepted
      ? [
          db.profile.update({ where: { userId: ctx.userId }, data: { followingCount: { decrement: 1 } } }),
          db.profile.update({ where: { userId: followeeId }, data: { followerCount: { decrement: 1 } } }),
        ]
      : []),
  ]);

  revalidateFolloweePaths(followeeUsername.handle);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
