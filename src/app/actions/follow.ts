"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { notifyNewFollower, notifyFollowRequest, notifyFollowRequestAccepted } from "@/lib/notifications";
import { recordFollowVelocityAnomaly } from "@/lib/account-risk";

// Real spam vector (mass-follow bots) — unlike read paths, this gets a
// budget. Silent no-op on limit hit, not an error, matching the "quiet
// no-op" posture already used for moveLink/toggleFeatured's own caps.
function checkFollowRateLimit(userId: string): boolean {
  return checkRateLimit(`follow:user:${userId}`, { max: 30, windowMs: 5 * 60 * 1000 });
}

function revalidateFollowPaths(followerHandle: string | null, followeeHandle: string | null) {
  revalidatePath("/feed");
  revalidatePath("/explore");
  if (followerHandle) {
    revalidatePath(`/${followerHandle}`);
    revalidatePath(`/${followerHandle}/following`);
  }
  if (followeeHandle) {
    revalidatePath(`/${followeeHandle}`);
    revalidatePath(`/${followeeHandle}/followers`);
  }
}

export async function followUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const followeeId = String(formData.get("followeeId") ?? "");

  if (!followeeId || followeeId === user.id) return;
  if (!checkFollowRateLimit(user.id)) {
    // phase-12 spec §6.2: textbook bot pattern, high-confidence — the
    // existing rate limit above is already the full reversible response;
    // this just records the audit signal for it.
    await recordFollowVelocityAnomaly(user.id);
    return;
  }
  if (await isBlockedEitherWay(user.id, followeeId)) return;

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId: user.id, followeeId } },
  });
  if (existing) return; // idempotent — double-follow is a no-op, not an error (spec §3.5)

  const followee = await db.user.findUnique({
    where: { id: followeeId },
    include: { username: true, profile: true },
  });
  // A followee without a claimed profile can't have its followerCount
  // incremented (Profile is optional 1:1 on User) — can't happen via any
  // current UI path (every signup creates a profile atomically), but this
  // guards the same forward-compat gap requireOwnProfile's own comment
  // flags for a future OAuth-only signup step.
  if (!followee || !followee.profile) return;

  // Private accounts require the followee's approval before the relationship
  // counts as a real follow (Instagram/Twitter-style private accounts, see
  // Profile.isPrivate and canViewFullProfile in [username]/page.tsx) — the
  // row is created immediately either way so a repeat click stays idempotent
  // via the `existing` check above, but a private target's row starts
  // "pending": no count bump, no notifyNewFollower, and (critically)
  // canViewFullProfile only treats "accepted" rows as isFollowing, so
  // requesting to follow a private account can never itself unlock its
  // content.
  if (followee.profile.isPrivate) {
    await db.follow.create({ data: { followerId: user.id, followeeId, status: "pending" } });
    await notifyFollowRequest({ recipientId: followeeId, actorId: user.id });
    revalidateFollowPaths(user.username?.handle ?? null, followee.username?.handle ?? null);
    return;
  }

  await db.$transaction([
    db.follow.create({ data: { followerId: user.id, followeeId, status: "accepted" } }),
    db.profile.update({ where: { userId: user.id }, data: { followingCount: { increment: 1 } } }),
    db.profile.update({ where: { userId: followeeId }, data: { followerCount: { increment: 1 } } }),
  ]);
  await notifyNewFollower({ recipientId: followeeId, actorId: user.id });

  revalidateFollowPaths(user.username?.handle ?? null, followee.username?.handle ?? null);
}

// Also the "cancel my pending request" action (same form, same idempotent
// existing-row-required shape) — a pending row was never counted, so it's
// only decremented when the row being removed was actually "accepted".
export async function unfollowUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const followeeId = String(formData.get("followeeId") ?? "");

  if (!followeeId) return;

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId: user.id, followeeId } },
  });
  if (!existing) return;

  const followee = await db.user.findUnique({
    where: { id: followeeId },
    include: { username: true },
  });

  const wasAccepted = existing.status === "accepted";
  await db.$transaction([
    db.follow.delete({ where: { followerId_followeeId: { followerId: user.id, followeeId } } }),
    ...(wasAccepted
      ? [
          db.profile.update({ where: { userId: user.id }, data: { followingCount: { decrement: 1 } } }),
          db.profile.update({ where: { userId: followeeId }, data: { followerCount: { decrement: 1 } } }),
        ]
      : []),
  ]);

  revalidateFollowPaths(user.username?.handle ?? null, followee?.username?.handle ?? null);
}

export async function acceptFollowRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const followerId = String(formData.get("followerId") ?? "");
  if (!followerId || followerId === user.id) return;

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId: user.id } },
  });
  if (!existing || existing.status !== "pending") return; // already handled or no such request

  const follower = await db.user.findUnique({ where: { id: followerId }, include: { username: true } });

  await db.$transaction([
    db.follow.update({
      where: { followerId_followeeId: { followerId, followeeId: user.id } },
      data: { status: "accepted" },
    }),
    db.profile.update({ where: { userId: followerId }, data: { followingCount: { increment: 1 } } }),
    db.profile.update({ where: { userId: user.id }, data: { followerCount: { increment: 1 } } }),
  ]);
  await notifyFollowRequestAccepted({ recipientId: followerId, actorId: user.id });

  revalidatePath("/notifications");
  revalidateFollowPaths(follower?.username?.handle ?? null, user.username?.handle ?? null);
}

export async function rejectFollowRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const followerId = String(formData.get("followerId") ?? "");
  if (!followerId || followerId === user.id) return;

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId: user.id } },
  });
  if (!existing || existing.status !== "pending") return; // already handled or no such request

  await db.follow.delete({ where: { followerId_followeeId: { followerId, followeeId: user.id } } });
  revalidatePath("/notifications");
}
