"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { notifyNewFollower } from "@/lib/notifications";

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
  if (!checkFollowRateLimit(user.id)) return;
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

  await db.$transaction([
    db.follow.create({ data: { followerId: user.id, followeeId } }),
    db.profile.update({ where: { userId: user.id }, data: { followingCount: { increment: 1 } } }),
    db.profile.update({ where: { userId: followeeId }, data: { followerCount: { increment: 1 } } }),
  ]);
  await notifyNewFollower({ recipientId: followeeId, actorId: user.id });

  revalidateFollowPaths(user.username?.handle ?? null, followee.username?.handle ?? null);
}

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

  await db.$transaction([
    db.follow.delete({ where: { followerId_followeeId: { followerId: user.id, followeeId } } }),
    db.profile.update({ where: { userId: user.id }, data: { followingCount: { decrement: 1 } } }),
    db.profile.update({ where: { userId: followeeId }, data: { followerCount: { decrement: 1 } } }),
  ]);

  revalidateFollowPaths(user.username?.handle ?? null, followee?.username?.handle ?? null);
}
