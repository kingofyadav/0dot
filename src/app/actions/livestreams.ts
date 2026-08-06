"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getCurrentUser } from "@/lib/session";
import { getLivestreamProvider, createLiveKitToken } from "@/lib/livestream-provider";
import { hasTierAccess } from "@/lib/tier-access";
import { notifyLivestreamStarted } from "@/lib/notifications";
import { publishToLivestreamChat } from "@/lib/livestream-chat-events";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

// Same convention/limits as community-chat.ts's checkChatRateLimit for the
// structurally identical "broadcast chat, no per-user read state" shape.
function checkChatRateLimit(userId: string, livestreamId: string): boolean {
  return checkRateLimit(`livestream-chat:send:${userId}:${livestreamId}`, { max: 30, windowMs: 5 * 60 * 1000 });
}

export async function createLivestream(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const requiredTierIdRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
  let requiredTierId: string | null = null;
  if (requiredTierIdRaw) {
    const tier = await db.membershipTier.findUnique({ where: { id: requiredTierIdRaw }, select: { creatorId: true } });
    if (!tier || tier.creatorId !== user.id) return { error: "Choose one of your own membership tiers." };
    requiredTierId = requiredTierIdRaw;
  }

  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "Invalid scheduled time." };

  const livestream = await db.livestream.create({
    data: { creatorId: user.id, title, requiredTierId, scheduledAt, ingestKey: "", playbackUrl: "" },
  });
  // Created first to get an id (the stub provider's stream identity is
  // just this row's own id) — a real provider would more likely be called
  // first and the row created from its response; either order is valid
  // once a real provider exists, this one just fits the stub best.
  const stream = await getLivestreamProvider().createStream({ id: livestream.id });
  await db.livestream.update({ where: { id: livestream.id }, data: stream });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

async function requireOwnedLivestream(livestreamId: string, userId: string) {
  const livestream = await db.livestream.findUnique({ where: { id: livestreamId } });
  if (!livestream || livestream.creatorId !== userId) return null;
  return livestream;
}

// spec §12: fires livestream_started to qualifying fans — subscribers at
// or above the required tier for a gated stream, or followers for an
// ungated one (no dedicated "livestream announcement" audience exists, so
// this reuses the two audiences the rest of the platform already has:
// tier subscribers §4.2, followers Phase 2 §3). In-app only, no push, same
// deferral Phase 2 §4.3 already made.
export async function startLivestream(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const livestreamId = String(formData.get("livestreamId") ?? "");
  if (!livestreamId) return;

  const livestream = await requireOwnedLivestream(livestreamId, user.id);
  if (!livestream || livestream.status !== "scheduled") return;

  await db.livestream.update({ where: { id: livestream.id }, data: { status: "live", startedAt: new Date() } });

  let recipientIds: string[];
  if (livestream.requiredTierId) {
    const requiredTier = await db.membershipTier.findUnique({ where: { id: livestream.requiredTierId }, select: { level: true } });
    const subscriptions = requiredTier
      ? await db.membershipSubscription.findMany({
          where: {
            tier: { creatorId: user.id, level: { gte: requiredTier.level } },
            OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }],
          },
          select: { fanId: true },
        })
      : [];
    recipientIds = subscriptions.map((s) => s.fanId);
  } else {
    const followers = await db.follow.findMany({ where: { followeeId: user.id }, select: { followerId: true } });
    recipientIds = followers.map((f) => f.followerId);
  }

  await Promise.all(
    [...new Set(recipientIds)].map((recipientId) =>
      notifyLivestreamStarted({ recipientId, actorId: user.id, livestreamId: livestream.id })
    )
  );

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

export async function endLivestream(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const livestreamId = String(formData.get("livestreamId") ?? "");
  if (!livestreamId) return;

  const livestream = await requireOwnedLivestream(livestreamId, user.id);
  if (!livestream || livestream.status !== "live") return;

  await db.livestream.update({ where: { id: livestream.id }, data: { status: "ended", endedAt: new Date() } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §8.3's literal criteria: a viewer without qualifying access never
// gets a valid playback token, and the owner's publish-capable token is
// never returned from this function — these are two separate functions so
// there's no shared code path that could accidentally hand a viewer a
// canPublish token. playbackUrl (not ingestKey) supplies the LiveKit room
// name here, keeping that owner/viewer field split intact even though the
// LiveKit provider happens to set both to the same string.
export async function requestViewerToken(livestreamId: string): Promise<{ token: string; url: string } | { error: string }> {
  const user = await getCurrentUser();

  const livestream = await db.livestream.findUnique({ where: { id: livestreamId } });
  if (!livestream || livestream.status !== "live") return { error: "This livestream isn't live." };

  if (livestream.requiredTierId) {
    const hasAccess = await hasTierAccess(user?.id ?? null, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return { error: "You don't have access to this livestream." };
  }

  const result = await createLiveKitToken({
    roomName: livestream.playbackUrl,
    identity: user?.id ?? `anon_${randomUUID()}`,
    name: user?.username?.handle,
    canPublish: false,
  });
  return result ?? { error: "Playback isn't configured yet." };
}

export async function requestBroadcastToken(livestreamId: string): Promise<{ token: string; url: string } | { error: string }> {
  const user = await requireVerifiedUser();

  const livestream = await requireOwnedLivestream(livestreamId, user.id);
  if (!livestream) return { error: "You don't have permission to broadcast this livestream." };

  const result = await createLiveKitToken({
    roomName: livestream.ingestKey,
    identity: user.id,
    name: user.username?.handle,
    canPublish: true,
  });
  return result ?? { error: "Broadcasting isn't configured yet." };
}

// spec §8.3's second criterion: rejected server-side for anyone without a
// valid session for this livestream — same hasTierAccess gate the
// playback URL uses, re-checked per message, not cached from an earlier
// join.
export async function sendChatMessage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const livestreamId = String(formData.get("livestreamId") ?? "");

  const livestream = await db.livestream.findUnique({ where: { id: livestreamId } });
  if (!livestream || livestream.status !== "live") return { error: "This livestream isn't live." };

  if (livestream.requiredTierId) {
    const hasAccess = await hasTierAccess(user.id, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return { error: "You don't have access to this livestream." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1 || body.length > 500) return { error: "Message must be 1-500 characters." };

  if (!checkChatRateLimit(user.id, livestreamId)) {
    return { error: "You're sending messages too fast. Please slow down." };
  }

  await db.livestreamChatMessage.create({ data: { livestreamId, senderId: user.id, body } });
  publishToLivestreamChat(livestreamId, { type: "new-chat-message" });
  revalidatePath(`/live/${livestreamId}`);
  return undefined;
}

export async function deleteLivestream(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const livestreamId = String(formData.get("livestreamId") ?? "");
  if (!livestreamId) return;

  const livestream = await requireOwnedLivestream(livestreamId, user.id);
  if (!livestream || livestream.status === "live") return;

  await db.livestream.delete({ where: { id: livestreamId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}/content/livestreams`);
}

export async function deleteChatMessage(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const messageId = String(formData.get("messageId") ?? "");
  if (!messageId) return;

  const message = await db.livestreamChatMessage.findUnique({ where: { id: messageId }, include: { livestream: true } });
  if (!message) return;
  if (message.senderId !== user.id && message.livestream.creatorId !== user.id) return;

  await db.livestreamChatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  publishToLivestreamChat(message.livestreamId, { type: "chat-message-deleted" });
  revalidatePath(`/live/${message.livestreamId}`);
}

