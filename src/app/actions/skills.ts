"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser, requireOwnProfile } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifySkillEndorsement } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

function checkEndorsementRateLimit(userId: string): boolean {
  return checkRateLimit(`skill:endorse:user:${userId}`, { max: 30, windowMs: 15 * 60 * 1000 });
}

// spec §4.1: name isn't restricted to a fixed taxonomy, just normalized
// (trimmed, case-folded) to reduce near-duplicate entries — an exact
// case-insensitive repeat on the same profile is rejected, near-duplicates
// ("React" vs "React.js") are left alone rather than attempting fuzzy dedup.
export async function addSkill(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 40) return { error: "Skill must be 1-40 characters." };

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  const existing = await db.skill.findMany({ where: { profileId: profile.id }, select: { name: true } });
  if (existing.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    return { error: "You already listed that skill." };
  }

  const count = await db.skill.count({ where: { profileId: profile.id } });
  await db.skill.create({ data: { profileId: profile.id, name, position: count } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
  return undefined;
}

export async function deleteSkill(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const skillId = String(formData.get("skillId") ?? "");
  if (!skillId) return;

  const skill = await db.skill.findUnique({ where: { id: skillId }, include: { profile: true } });
  if (!skill || skill.profile.userId !== user.id) return;

  await db.skill.delete({ where: { id: skillId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
}

// Mirrors moveLink (src/app/actions/profile.ts) exactly: swap adjacent
// position values in a transaction, this codebase's stand-in for
// drag-and-drop reordering.
export async function moveSkill(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const skillId = String(formData.get("skillId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;

  const skill = await db.skill.findUnique({ where: { id: skillId }, include: { profile: true } });
  if (!skill || skill.profile.userId !== user.id) return;

  const siblings = await db.skill.findMany({ where: { profileId: skill.profileId }, orderBy: { position: "asc" } });
  const index = siblings.findIndex((s) => s.id === skillId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const other = siblings[swapIndex];
  await db.$transaction([
    db.skill.update({ where: { id: skill.id }, data: { position: other.position } }),
    db.skill.update({ where: { id: other.id }, data: { position: skill.position } }),
  ]);

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §4.2: a repeat endorsement is a no-op, not an error — the composite
// PK on SkillEndorsement makes the DB reject a duplicate, caught here and
// swallowed, same idempotency posture PollVote/ProjectLike's own
// existence-check-first pattern establishes elsewhere.
export async function endorseSkill(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const skillId = String(formData.get("skillId") ?? "");
  if (!skillId) return;

  const skill = await db.skill.findUnique({ where: { id: skillId }, include: { profile: true } });
  if (!skill) return;
  if (skill.profile.userId === user.id) return; // no self-endorsement

  const existing = await db.skillEndorsement.findUnique({
    where: { skillId_endorserId: { skillId, endorserId: user.id } },
  });
  if (existing) return;

  if (!checkEndorsementRateLimit(user.id)) return;

  await db.$transaction([
    db.skillEndorsement.create({ data: { skillId, endorserId: user.id } }),
    db.skill.update({ where: { id: skillId }, data: { endorsementCount: { increment: 1 } } }),
  ]);
  await notifySkillEndorsement({ recipientId: skill.profile.userId, actorId: user.id, skillId });
}
