"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { encryptAtRest } from "@/lib/message-crypto";
import { isCrossPostPlatform } from "@/lib/cross-post-platforms";
import type { ActionState } from "@/app/actions/auth";

const MAX_MEDIA_PER_POST = 4;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function revalidateCrossPostPaths(handle: string): void {
  revalidatePath(`/s/${handle}/cross-post`);
}

// Stub-connect: no live OAuth app exists for any of these platforms yet
// (see social-publish-provider.ts's stub publish providers) — "connecting"
// an account creates the row immediately with a fake token instead of
// redirecting through a real OAuth authorize step. Swapping in real OAuth
// later replaces this function's body only; callers and the UI form above
// it don't change shape.
export async function connectExternalAccount(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const platform = String(formData.get("platform") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!isCrossPostPlatform(platform)) {
    return { error: "Choose a valid platform." };
  }
  if (displayName.length < 1 || displayName.length > 80) {
    return { error: "Enter the account name or handle (1-80 characters)." };
  }

  const existingCount = await db.externalSocialAccount.count({ where: { profileId: user.profile!.id } });
  if (existingCount >= 20) {
    return { error: "You've reached the connected-account limit." };
  }

  const externalAccountId = randomBytes(8).toString("hex");
  await db.externalSocialAccount.create({
    data: {
      profileId: user.profile!.id,
      platform,
      externalAccountId,
      displayName,
      accessTokenEnc: encryptAtRest(`demo-token-${externalAccountId}`),
      status: "connected",
    },
  });

  revalidateCrossPostPaths(user.username!.handle);
  return undefined;
}

// Revokes rather than deletes: a hard delete would cascade onto every
// CrossPostTarget for this account (including already-published ones),
// erasing publish history and making rollUpIfDone's `every()` vacuously
// true over the now-empty set. Marking the account "revoked" instead keeps
// history intact and is enough on its own to keep it out of
// createScheduledCrossPost's status: "connected" filter for new posts.
export async function disconnectExternalAccount(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const accountId = String(formData.get("accountId") ?? "");

  await db.externalSocialAccount.updateMany({
    where: { id: accountId, profileId: user.profile!.id },
    data: { status: "revoked" },
  });

  revalidateCrossPostPaths(user.username!.handle);
}

// Same per-user velocity budget as posts.ts's checkPostRateLimit — a
// scheduled cross-post is still "create a post," just fanned out to
// external targets, so it gets the identical shape (phase-1 spec §7.2
// posture, applied here rather than a new rule).
function checkCrossPostRateLimit(userId: string): boolean {
  return checkRateLimit(`cross-post:create:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
}

export async function createScheduledCrossPost(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  if (!checkCrossPostRateLimit(user.id)) {
    return { error: "You're scheduling posts too fast. Please slow down." };
  }

  const content = String(formData.get("content") ?? "").trim();
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  const accountIds = formData
    .getAll("accountIds")
    .map((value) => String(value))
    .filter(Boolean);
  const mediaFiles = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (mediaFiles.length > MAX_MEDIA_PER_POST) {
    return { error: `You can attach up to ${MAX_MEDIA_PER_POST} images.` };
  }
  if (content.length < 1 && mediaFiles.length === 0) {
    return { error: "Post can't be empty." };
  }
  if (content.length > 500) {
    return { error: "Posts are limited to 500 characters." };
  }
  if (accountIds.length === 0) {
    return { error: "Select at least one connected account." };
  }

  const scheduledFor = new Date(scheduledForRaw);
  if (!scheduledForRaw || Number.isNaN(scheduledFor.getTime())) {
    return { error: "Invalid scheduled time." };
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return { error: "Scheduled time must be in the future." };
  }

  // Only accounts the caller actually owns (and that are still connected)
  // can be targeted — a client-submitted accountId is never trusted as-is,
  // same posture as createPost's requiredTierId ownership check.
  const accounts = await db.externalSocialAccount.findMany({
    where: { id: { in: accountIds }, profileId: user.profile!.id, status: "connected" },
  });
  if (accounts.length === 0) {
    return { error: "Select at least one connected account." };
  }

  const mediaUrls: string[] = [];
  for (const file of mediaFiles) {
    const result = await saveUploadedImage(file, { maxBytes: MAX_MEDIA_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    mediaUrls.push(result.url);
  }

  await db.scheduledCrossPost.create({
    data: {
      profileId: user.profile!.id,
      content,
      mediaUrlsJson: JSON.stringify(mediaUrls),
      scheduledFor,
      targets: { create: accounts.map((account) => ({ externalAccountId: account.id })) },
    },
  });

  revalidateCrossPostPaths(user.username!.handle);
  return undefined;
}

export async function cancelScheduledCrossPost(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const postId = String(formData.get("postId") ?? "");

  await db.scheduledCrossPost.updateMany({
    where: { id: postId, profileId: user.profile!.id, status: "scheduled" },
    data: { status: "canceled" },
  });

  revalidateCrossPostPaths(user.username!.handle);
}
