"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isCommunityStaff } from "@/lib/communities";

// phase-3 spec §9.1: only the question's author or a community moderator,
// enforced server-side — never just hidden in the UI.
async function requireAnswerAuthority(question: { authorId: string; communityId: string | null }, userId: string) {
  if (question.authorId === userId) return true;
  if (question.communityId && (await isCommunityStaff(question.communityId, userId))) return true;
  return false;
}

async function revalidateQuestionPaths(question: { id: string; author: { username: { handle: string } | null } }) {
  revalidatePath("/feed");
  revalidatePath("/explore");
  if (question.author.username) revalidatePath(`/${question.author.username.handle}`);
}

// spec §9.1: only a reply to *this* question (not an arbitrary post) can
// be accepted — verified against the real replyToId, never trusted as an
// opaque client-supplied pairing.
export async function acceptAnswer(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const questionId = String(formData.get("questionId") ?? "");
  const replyId = String(formData.get("replyId") ?? "");
  if (!questionId || !replyId) return;

  const question = await db.post.findFirst({
    where: { id: questionId, postType: "question", deletedAt: null },
    include: { author: { include: { username: true } } },
  });
  if (!question) return;
  if (!(await requireAnswerAuthority(question, user.id))) return;

  const reply = await db.post.findFirst({
    where: { id: replyId, replyToId: questionId, deletedAt: null },
    select: { id: true },
  });
  if (!reply) return;

  await db.post.update({ where: { id: questionId }, data: { acceptedAnswerId: replyId } });
  await revalidateQuestionPaths(question);
}

export async function unacceptAnswer(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) return;

  const question = await db.post.findFirst({
    where: { id: questionId, postType: "question", deletedAt: null },
    include: { author: { include: { username: true } } },
  });
  if (!question) return;
  if (!(await requireAnswerAuthority(question, user.id))) return;

  await db.post.update({ where: { id: questionId }, data: { acceptedAnswerId: null } });
  await revalidateQuestionPaths(question);
}
