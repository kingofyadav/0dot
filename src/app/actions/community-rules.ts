"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isCommunityStaff, logModAction } from "@/lib/communities";

const MAX_RULES = 20; // defensive cap, not spec-mandated — same posture as GROUP_PARTICIPANT_CAP

// phase-3 spec §15 lists rule edits as a community_update source, but that
// notification type is per-recipient (src/lib/notifications.ts) and this
// codebase has no "fan out to every community member" write pattern
// anywhere yet — building one just for this, un-reviewed, risks silently
// spamming every member's notification list on a punctuation fix. Flagged
// here deliberately rather than either building it unreviewed or omitting
// it silently; §15's other two events (moderator promotion, join-request
// approval) ARE wired (src/app/actions/communities.ts) since those are
// naturally single-recipient.

async function requireStaffCommunity(communityId: string, userId: string) {
  if (!communityId) return null;
  if (!(await isCommunityStaff(communityId, userId))) return null;
  return db.community.findUnique({ where: { id: communityId }, select: { id: true, slug: true } });
}

// phase-3 spec §5: editable by moderators/owner only.
export async function addRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 1 || title.length > 80 || body.length > 500) return;

  const community = await requireStaffCommunity(communityId, user.id);
  if (!community) return;

  const count = await db.communityRule.count({ where: { communityId } });
  if (count >= MAX_RULES) return;

  const rule = await db.communityRule.create({
    data: { communityId, title, body, position: count },
  });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "edit_rule",
    targetType: "rule",
    targetId: rule.id,
  });

  revalidatePath(`/c/${community.slug}`);
  revalidatePath(`/c/${community.slug}/manage`);
}

export async function updateRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 1 || title.length > 80 || body.length > 500) return;

  const community = await requireStaffCommunity(communityId, user.id);
  if (!community) return;

  const rule = await db.communityRule.findFirst({ where: { id: ruleId, communityId } });
  if (!rule) return;

  await db.communityRule.update({ where: { id: ruleId }, data: { title, body } });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "edit_rule",
    targetType: "rule",
    targetId: ruleId,
  });

  revalidatePath(`/c/${community.slug}`);
  revalidatePath(`/c/${community.slug}/manage`);
}

export async function deleteRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");

  const community = await requireStaffCommunity(communityId, user.id);
  if (!community) return;

  const rule = await db.communityRule.findFirst({ where: { id: ruleId, communityId } });
  if (!rule) return;

  // Deleting doesn't renumber the rest — position only needs to establish a
  // stable relative order (moveRule below), not be a dense 0..n-1 sequence,
  // same "gaps are fine" posture Link.position already has in Phase 1.
  await db.communityRule.delete({ where: { id: ruleId } });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "edit_rule",
    targetType: "rule",
    targetId: ruleId,
    reason: "deleted",
  });

  revalidatePath(`/c/${community.slug}`);
  revalidatePath(`/c/${community.slug}/manage`);
}

// Swap-based reorder — exact shape as moveLink (src/app/actions/profile.ts).
export async function moveRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const community = await requireStaffCommunity(communityId, user.id);
  if (!community) return;

  const rules = await db.communityRule.findMany({
    where: { communityId },
    orderBy: { position: "asc" },
  });

  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rules.length) return;

  const current = rules[index];
  const swapWith = rules[swapIndex];

  await db.$transaction([
    db.communityRule.update({ where: { id: current.id }, data: { position: swapWith.position } }),
    db.communityRule.update({ where: { id: swapWith.id }, data: { position: current.position } }),
  ]);

  revalidatePath(`/c/${community.slug}`);
  revalidatePath(`/c/${community.slug}/manage`);
}
