"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { saveUploadedImage } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MAX_MEDIA_PER_POST = 4;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_ERROR = "You're posting too fast. Please slow down.";

// Shared by createPost and createQuoteRepost — both create a Post row, and
// a per-action limit alone would let someone bypass createPost's budget by
// spamming quotes instead. Keyed by user (not IP): these actions already
// require an authenticated, verified user, so the account is the
// meaningful identity to throttle — see phase-1 spec §7.2.
function checkPostRateLimit(userId: string): boolean {
  return checkRateLimit(`post:create:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
}

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

  if (!checkPostRateLimit(user.id)) {
    return { error: RATE_LIMIT_ERROR };
  }

  const body = String(formData.get("body") ?? "").trim();
  const replyToId = String(formData.get("replyToId") ?? "").trim() || null;
  const mediaFiles = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (mediaFiles.length > MAX_MEDIA_PER_POST) {
    return { error: `You can attach up to ${MAX_MEDIA_PER_POST} images.` };
  }
  // 0-length body is only allowed when media makes up for it (spec §5.2).
  if (body.length < 1 && mediaFiles.length === 0) {
    return { error: "Post can't be empty." };
  }
  if (body.length > 500) {
    return { error: "Posts are limited to 500 characters." };
  }

  const mediaCreates: { url: string; position: number }[] = [];
  for (const [index, file] of mediaFiles.entries()) {
    const result = await saveUploadedImage(file, { maxBytes: MAX_MEDIA_BYTES });
    if ("error" in result) return { error: result.error };
    mediaCreates.push({ url: result.url, position: index });
  }

  if (replyToId) {
    // Parsed/validated server-side against the real parent row, never
    // trusted as an opaque client-supplied ID that always succeeds.
    const parent = await db.post.findFirst({ where: { id: replyToId, deletedAt: null } });
    if (!parent) {
      return { error: "The post you're replying to is no longer available." };
    }
    await db.$transaction([
      db.post.create({
        data: { authorId: user.id, body, replyToId, media: { create: mediaCreates } },
      }),
      db.post.update({ where: { id: replyToId }, data: { replyCount: { increment: 1 } } }),
    ]);
  } else {
    await db.post.create({
      data: { authorId: user.id, body, media: { create: mediaCreates } },
    });
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
  // duplicate plain reposts, mirroring the like-toggle pattern. Scoped to
  // body:"" specifically so this never touches a quote-repost the same
  // user may also have made of the same post — those are independent,
  // deliberate posts (see createQuoteRepost), not toggle state.
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

export async function createQuoteRepost(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkPostRateLimit(user.id)) {
    return { error: RATE_LIMIT_ERROR };
  }

  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  // An empty-body "quote" is just toggleRepost — this action exists
  // specifically for adding commentary, so it requires some.
  if (body.length < 1) {
    return { error: "Add a comment to quote this post." };
  }
  if (body.length > 500) {
    return { error: "Posts are limited to 500 characters." };
  }

  const original = await db.post.findFirst({ where: { id: postId, deletedAt: null } });
  if (!original) {
    return { error: "That post is no longer available." };
  }

  // Counts toward the same repostCount as a plain repost — a quote is
  // still a repost semantically, just with commentary attached. Unlike
  // toggleRepost this isn't idempotent: a user can quote the same post
  // multiple times with different commentary (matches how quote-reposts
  // work elsewhere), so each submission is its own post.
  await db.$transaction([
    db.post.create({ data: { authorId: user.id, body, repostOfId: postId } }),
    db.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } }),
  ]);

  revalidatePath("/feed");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
  return undefined;
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
  if (post.repostOfId) {
    // Applies to both a plain repost and a quote-repost being deleted —
    // both counted toward the original's repostCount when created.
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
