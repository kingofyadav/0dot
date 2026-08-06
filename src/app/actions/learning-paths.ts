"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

// spec §12.1: curricula spanning multiple courses — courseIds are ordered
// references to existing Course rows, no second Course-equivalent table.
export async function createLearningPath(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 160) return { error: "Title must be 1-160 characters." };

  const courseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  if (courseIds.length === 0) return { error: "Select at least one course." };

  const ownedCount = await db.course.count({ where: { id: { in: courseIds }, creatorId: user.id } });
  if (ownedCount !== courseIds.length) return { error: "You can only add your own courses to a learning path." };

  await db.learningPath.create({
    data: { creatorId: user.id, title, courseIdsJson: JSON.stringify(courseIds) },
  });

  revalidatePath(`/s/${user.username!.handle}/content/learning-paths`);
  return undefined;
}

export async function deleteLearningPath(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const id = String(formData.get("pathId") ?? "");
  const path = await db.learningPath.findUnique({ where: { id } });
  if (!path || path.creatorId !== user.id) return;

  await db.learningPath.delete({ where: { id } });
  revalidatePath(`/s/${user.username!.handle}/content/learning-paths`);
}
