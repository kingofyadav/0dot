"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isOwnBlobUploadUrl, verifyRemoteImageBytes } from "@/lib/uploads";
import { createFileAsset } from "@/lib/ai-accessibility";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { notifyLike, notifyReply, notifyMentionsInBody } from "@/lib/notifications";
import { resolvePostCommunityContext } from "@/lib/communities";
import { resolveBusinessAuthorContext } from "@/lib/businesses";
import { softDeletePostAndDecrementCounts } from "@/lib/post-moderation";
import { checkDuplicatePostPattern } from "@/lib/account-risk";
import { recordContentRevision } from "@/lib/content-revisions";
import { revalidatePostSurfaces } from "@/lib/post-revalidation";
import type { ActionState } from "@/app/actions/auth";

const MAX_MEDIA_PER_POST = 4;
const RATE_LIMIT_ERROR = "You're posting too fast. Please slow down.";
const MEDIA_VERIFY_ERROR = "One of the attached images couldn't be verified. Please remove it and try again.";

// Post images are uploaded client-side straight to Vercel Blob
// (/api/upload/post-media) — ComposeBox submits the resulting URLs in a
// `mediaUrls` JSON field, not file bytes. Parse defensively: anything that
// isn't an array of our-own-Blob-store URLs is dropped.
function parseMediaUrls(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && isOwnBlobUploadUrl(u));
  } catch {
    return [];
  }
}

// Shared by createPost, createQuoteRepost, and polls.ts's createPollPost —
// all three create a Post row, and a per-action limit alone would let
// someone bypass createPost's budget by spamming quotes/polls instead.
// Keyed by user (not IP): these actions already require an authenticated,
// verified user, so the account is the meaningful identity to throttle —
// see phase-1 spec §7.2. polls.ts calls checkRateLimit directly with this
// same key string rather than importing this function (a plain exported
// function from a "use server" file becomes a client-invokable action,
// which this — a boolean helper with no auth of its own — must never be).
function checkPostRateLimit(userId: string): boolean {
  return checkRateLimit(`post:create:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
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
  const mediaUrls = parseMediaUrls(formData.get("mediaUrls"));

  if (mediaUrls.length > MAX_MEDIA_PER_POST) {
    return { error: `You can attach up to ${MAX_MEDIA_PER_POST} images.` };
  }
  // 0-length body is only allowed when media makes up for it (spec §5.2).
  if (body.length < 1 && mediaUrls.length === 0) {
    return { error: "Post can't be empty." };
  }
  if (body.length > 500) {
    return { error: "Posts are limited to 500 characters." };
  }

  // phase-3 spec §7.1: a community post is a top-level post scoped to a
  // community — never a reply (replies render inline under their parent
  // regardless of community, so there's no community-scoped reply concept
  // to build here). A communityId submitted alongside a replyToId is
  // simply ignored, matching what the actual UI ever sends (ReplyForm
  // never includes communityId).
  let communityId: string | null = null;
  let communitySlug: string | null = null;
  let flairId: string | null = null;
  if (!replyToId) {
    const communityContext = await resolvePostCommunityContext(
      user.id,
      String(formData.get("communityId") ?? "").trim() || null,
      String(formData.get("flairId") ?? "").trim() || null
    );
    if (communityContext && "error" in communityContext) return { error: communityContext.error };
    if (communityContext) {
      communityId = communityContext.communityId;
      communitySlug = communityContext.communitySlug;
      flairId = communityContext.flairId;
    }
  }

  // phase-4 spec §5: a business post is still a top-level post — replies
  // "as the business" aren't a build-plan step 2 concern, same reasoning as
  // communityId above only applying to top-level posts.
  let businessAuthorId: string | null = null;
  if (!replyToId) {
    const businessContext = await resolveBusinessAuthorContext(
      user.id,
      String(formData.get("businessId") ?? "").trim() || null
    );
    if (businessContext && "error" in businessContext) return { error: businessContext.error };
    if (businessContext) businessAuthorId = businessContext.businessId;
  }

  // phase-5 spec §4.2: a gated post is still a top-level post — reusing the
  // same requiredTierId-null-means-ungated field Post already carries, not
  // a separate "gated post" entity. Only meaningful for a top-level post
  // (same reasoning as communityId/businessAuthorId above), and only ever
  // settable to one of the *author's own* active tiers — trusting a raw
  // client-submitted tierId without this check would let anyone gate a post
  // behind someone else's paywall.
  let requiredTierId: string | null = null;
  if (!replyToId) {
    const requiredTierRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
    if (requiredTierRaw) {
      const tier = await db.membershipTier.findUnique({ where: { id: requiredTierRaw }, select: { creatorId: true, status: true } });
      if (!tier || tier.creatorId !== user.id || tier.status !== "active") {
        return { error: "Choose one of your own active membership tiers." };
      }
      requiredTierId = requiredTierRaw;
    }
  }

  // phase-3 spec §9: a question is structurally identical to a normal post
  // (same body/media/community/flair fields), just flagged — unlike polls,
  // which have a genuinely different compose shape and get their own
  // action (src/app/actions/polls.ts). Only meaningful (and only ever set)
  // for a top-level post, same reasoning as communityId above.
  const postTypeRaw = String(formData.get("postType") ?? "standard");
  const postType = !replyToId && postTypeRaw === "question" ? "question" : "standard";

  // The bytes are already in Blob (client-direct upload). Re-verify each
  // URL's first 4KB really is an allowed image — the upload token only
  // checked the declared Content-Type — then create the FileAsset row
  // saveUploadedImage used to create inline (drives phase-11 accessibility
  // captioning).
  const mediaCreates: { url: string; position: number }[] = [];
  for (const [index, url] of mediaUrls.entries()) {
    const ext = await verifyRemoteImageBytes(url);
    if (!ext) return { error: MEDIA_VERIFY_ERROR };
    await createFileAsset({ url, contentType: "image", uploadedById: user.id });
    mediaCreates.push({ url, position: index });
  }

  let newPostId: string;
  if (replyToId) {
    // Parsed/validated server-side against the real parent row, never
    // trusted as an opaque client-supplied ID that always succeeds.
    const parent = await db.post.findFirst({ where: { id: replyToId, deletedAt: null } });
    if (!parent) {
      return { error: "The post you're replying to is no longer available." };
    }
    const [newPost] = await db.$transaction([
      db.post.create({
        data: { authorId: user.id, body, replyToId, media: { create: mediaCreates } },
      }),
      db.post.update({ where: { id: replyToId }, data: { replyCount: { increment: 1 } } }),
    ]);
    newPostId = newPost.id;
    await notifyReply({ recipientId: parent.authorId, actorId: user.id, subjectId: replyToId });
  } else {
    const newPost = await db.post.create({
      data: { authorId: user.id, body, communityId, flairId, businessAuthorId, postType, requiredTierId, media: { create: mediaCreates } },
    });
    newPostId = newPost.id;
  }

  await notifyMentionsInBody(body, user.id, newPostId);
  // phase-12 spec §6.1/§6.2: account-level velocity/duplicate-content
  // signal, distinct from phase-11's per-content ModerationFlag — never
  // blocks this request, only records the pattern and (past its
  // threshold) opens a case for human review.
  await checkDuplicatePostPattern(user.id, body);

  revalidatePath("/feed");
  revalidatePath("/explore");
  if (communitySlug) {
    revalidatePath(`/c/${communitySlug}`);
  }
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
  return undefined;
}

export async function toggleLike(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  const [existing, post] = await Promise.all([
    db.postLike.findUnique({ where: { postId_userId: { postId, userId: user.id } } }),
    db.post.findUnique({ where: { id: postId }, select: { authorId: true } }),
  ]);
  if (!post) return;

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
    await notifyLike({ recipientId: post.authorId, actorId: user.id, subjectId: postId });
  }

  await revalidatePostSurfaces(postId);
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
  revalidatePath("/explore");
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
  //
  // Read + write in one transaction (not just the write) — two concurrent
  // calls could otherwise both read "not reposted yet" before either write
  // commits, inserting two repost rows for one logical toggle.
  await db.$transaction(async (tx) => {
    const existing = await tx.post.findFirst({
      where: { authorId: user.id, repostOfId: postId, body: "", deletedAt: null },
    });

    if (existing) {
      await tx.post.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      await tx.post.update({ where: { id: postId }, data: { repostCount: { decrement: 1 } } });
    } else {
      await tx.post.create({ data: { authorId: user.id, body: "", repostOfId: postId } });
      await tx.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } });
    }
  });

  await revalidatePostSurfaces(postId);
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
  const [newPost] = await db.$transaction([
    db.post.create({ data: { authorId: user.id, body, repostOfId: postId } }),
    db.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } }),
  ]);
  await notifyMentionsInBody(body, user.id, newPost.id);

  revalidatePath("/feed");
  revalidatePath("/explore");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
  return undefined;
}

// phase-13 spec §3.3: the first Post edit path this codebase has — every
// edit creates a ContentRevision (content-revisions.ts) inside the same
// transaction as the body update, so history exists before the change is
// visible, never overwritten in place with no trace (same "append, never
// mutate" posture as WikiRevision/updateArticle).
export async function editPost(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (body.length < 1) return { error: "Post can't be empty." };
  if (body.length > 500) return { error: "Posts are limited to 500 characters." };

  const post = await db.post.findFirst({ where: { id: postId, authorId: user.id, deletedAt: null } });
  if (!post) return { error: "Post not found." };

  await db.$transaction(async (tx) => {
    await recordContentRevision(tx, "post", post.id, body, user.id);
    await tx.post.update({ where: { id: post.id }, data: { body } });
  });

  revalidatePath("/feed");
  revalidatePath("/explore");
  if (user.username) revalidatePath(`/${user.username.handle}`);
  return undefined;
}

export async function deletePost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const postId = String(formData.get("postId") ?? "");

  const post = await db.post.findFirst({
    where: { id: postId, authorId: user.id, deletedAt: null },
  });
  if (!post) return;

  await softDeletePostAndDecrementCounts(post);

  revalidatePath("/feed");
  revalidatePath("/explore");
  revalidatePath("/bookmarks");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
  }
}
