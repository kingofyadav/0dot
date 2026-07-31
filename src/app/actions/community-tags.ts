"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isCommunityOwner, isCommunityStaff } from "@/lib/communities";
import { COMMUNITY_TAG_KEYS, MAX_TAGS_PER_COMMUNITY } from "@/lib/community-tags";
import { FLAIR_COLOR_KEYS, MAX_FLAIRS_PER_COMMUNITY } from "@/lib/flair-colors";

// Owner-only (same tier as visibility/name — community-level configuration,
// not routine moderation) — replaces the tag set wholesale rather than
// incremental add/remove, simpler for a small capped set that's edited as
// a unit from one form.
export async function setCommunityTags(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  if (!communityId) return;
  if (!(await isCommunityOwner(communityId, user.id))) return;

  const requested = [...new Set(formData.getAll("tag").map(String))]
    .filter((tag) => COMMUNITY_TAG_KEYS.has(tag))
    .slice(0, MAX_TAGS_PER_COMMUNITY);

  await db.$transaction([
    db.communityTag.deleteMany({ where: { communityId } }),
    db.communityTag.createMany({ data: requested.map((tag) => ({ communityId, tag })) }),
  ]);

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) {
    revalidatePath(`/c/${community.slug}`);
    revalidatePath(`/c/${community.slug}/manage`);
  }
}

export async function createPostFlair(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  if (!communityId || label.length < 1 || label.length > 30 || !FLAIR_COLOR_KEYS.has(color)) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const count = await db.communityPostFlair.count({ where: { communityId } });
  if (count >= MAX_FLAIRS_PER_COMMUNITY) return;

  await db.communityPostFlair.create({ data: { communityId, label, color } });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

export async function deletePostFlair(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const flairId = String(formData.get("flairId") ?? "");
  if (!communityId || !flairId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  await db.communityPostFlair.deleteMany({ where: { id: flairId, communityId } });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}
