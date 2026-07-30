"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { ActionState } from "@/app/actions/auth";

async function requireVerifiedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify/sent");
  return user;
}

export async function createPost(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const body = String(formData.get("body") ?? "").trim();
  const replyToId = String(formData.get("replyToId") ?? "").trim() || null;

  if (body.length < 1) {
    return { error: "Post can't be empty." };
  }
  if (body.length > 500) {
    return { error: "Posts are limited to 500 characters." };
  }

  if (replyToId) {
    // Parsed/validated server-side against the real parent row, never
    // trusted as an opaque client-supplied ID that always succeeds.
    const parent = await db.post.findFirst({ where: { id: replyToId, deletedAt: null } });
    if (!parent) {
      return { error: "The post you're replying to is no longer available." };
    }
    await db.$transaction([
      db.post.create({ data: { authorId: user.id, body, replyToId } }),
      db.post.update({ where: { id: replyToId }, data: { replyCount: { increment: 1 } } }),
    ]);
  } else {
    await db.post.create({ data: { authorId: user.id, body } });
  }

  revalidatePath("/feed");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
  return undefined;
}

export async function toggleLike(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  const existing = await db.postLike.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
  });

  if (existing) {
    await db.$transaction([
      db.postLike.delete({ where: { postId_userId: { postId, userId: user.id } } }),
      db.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ]);
  } else {
    await db.$transaction([
      db.postLike.create({ data: { postId, userId: user.id } }),
      db.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
  }

  revalidatePath("/feed");
}

export async function toggleBookmark(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  // Private, toggle, never shown to anyone else — no denormalized count
  // (phase-1 spec §5.3: bookmark counts are never public).
  const existing = await db.bookmark.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
  });

  if (existing) {
    await db.bookmark.delete({ where: { postId_userId: { postId, userId: user.id } } });
  } else {
    await db.bookmark.create({ data: { postId, userId: user.id } });
  }

  revalidatePath("/feed");
  revalidatePath("/bookmarks");
}

export async function toggleRepost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  const original = await db.post.findFirst({ where: { id: postId, deletedAt: null } });
  if (!original) return;

  // Idempotent per user: a second click un-reposts rather than stacking
  // duplicate reposts, mirroring the like-toggle pattern.
  const existing = await db.post.findFirst({
    where: { authorId: user.id, repostOfId: postId, body: "", deletedAt: null },
  });

  if (existing) {
    await db.$transaction([
      db.post.update({ where: { id: existing.id }, data: { deletedAt: new Date() } }),
      db.post.update({ where: { id: postId }, data: { repostCount: { decrement: 1 } } }),
    ]);
  } else {
    await db.$transaction([
      db.post.create({ data: { authorId: user.id, body: "", repostOfId: postId } }),
      db.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } }),
    ]);
  }

  revalidatePath("/feed");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
}

export async function deletePost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  const post = await db.post.findFirst({
    where: { id: postId, authorId: user.id, deletedAt: null },
  });
  if (!post) return;

  // Soft delete — tombstone remains so reply threads and reposts referencing
  // it don't 404, but denormalized counts on whatever it was attached to
  // still need to come back down.
  const updates = [db.post.update({ where: { id: postId }, data: { deletedAt: new Date() } })];
  if (post.replyToId) {
    updates.push(
      db.post.update({ where: { id: post.replyToId }, data: { replyCount: { decrement: 1 } } })
    );
  }
  if (post.repostOfId && post.body === "") {
    updates.push(
      db.post.update({ where: { id: post.repostOfId }, data: { repostCount: { decrement: 1 } } })
    );
  }
  await db.$transaction(updates);

  revalidatePath("/feed");
  revalidatePath("/bookmarks");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
}
