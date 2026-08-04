"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyReactionLike, notifyReactionComment } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

// phase-7 spec §4: the generalized Reaction/Comment primitive, now wired
// for all four subject types the spec names (build plan steps 2/5/7/9).
// `ownerId: null` means "no single resolvable recipient" (a community-owned
// WikiPage — there's no fan-out-to-every-moderator notification pattern in
// this codebase, same restraint community_update/rule edits already show)
// — the reaction/comment still succeeds, it just never fires a
// notification. `bumpLike`/`bumpComment` are undefined for subject types
// with no cached counter column (WikiPage, PublishedFile — spec's own field
// lists for those don't include like_count/comment_count the way Article/
// Book's do); their counts are computed at read time via Reaction/Comment
// queries instead, so toggleReaction/createComment simply skip the
// increment/decrement step for them.
type ResolvedSubject = {
  ownerId: string | null;
  path: string;
  bumpLike?: (delta: 1 | -1) => Prisma.PrismaPromise<unknown>;
  bumpComment?: (delta: 1 | -1) => Prisma.PrismaPromise<unknown>;
};

async function resolveArticleSubject(subjectId: string): Promise<ResolvedSubject | null> {
  const article = await db.article.findUnique({
    where: { id: subjectId },
    select: { authorId: true, slug: true, author: { select: { username: true } } },
  });
  if (!article?.author.username) return null;
  const path = `${article.author.username.handle}/articles/${article.slug}`;
  return {
    ownerId: article.authorId,
    path,
    bumpLike: (delta) => db.article.update({ where: { id: subjectId }, data: { likeCount: { increment: delta } } }),
    bumpComment: (delta) => db.article.update({ where: { id: subjectId }, data: { commentCount: { increment: delta } } }),
  };
}

// A WikiPage's owner (and therefore its route) depends on which of the
// three-way XOR is set (spec §5.1) — profile-owned personal wiki/docs,
// book-owned chapters, or community-owned pages (unchanged since Phase 3).
async function resolveWikiPageSubject(subjectId: string): Promise<ResolvedSubject | null> {
  const page = await db.wikiPage.findUnique({
    where: { id: subjectId },
    select: {
      slug: true,
      community: { select: { slug: true } },
      profile: { select: { userId: true, user: { select: { username: true } } } },
      book: { select: { slug: true, profile: { select: { userId: true, user: { select: { username: true } } } } } },
    },
  });
  if (!page) return null;

  if (page.profile) {
    const handle = page.profile.user.username?.handle;
    if (!handle) return null;
    return { ownerId: page.profile.userId, path: `${handle}/wiki/${page.slug}` };
  }
  if (page.book) {
    const handle = page.book.profile.user.username?.handle;
    if (!handle) return null;
    return { ownerId: page.book.profile.userId, path: `${handle}/books/${page.book.slug}/${page.slug}` };
  }
  if (page.community) {
    return { ownerId: null, path: `c/${page.community.slug}/wiki/${page.slug}` };
  }
  return null;
}

async function resolveBookSubject(subjectId: string): Promise<ResolvedSubject | null> {
  const book = await db.book.findUnique({
    where: { id: subjectId },
    select: { slug: true, profile: { select: { userId: true, user: { select: { username: true } } } } },
  });
  const handle = book?.profile.user.username?.handle;
  if (!book || !handle) return null;
  const path = `${handle}/books/${book.slug}`;
  return {
    ownerId: book.profile.userId,
    path,
    bumpLike: (delta) => db.book.update({ where: { id: subjectId }, data: { likeCount: { increment: delta } } }),
    bumpComment: (delta) => db.book.update({ where: { id: subjectId }, data: { commentCount: { increment: delta } } }),
  };
}

async function resolvePublishedFileSubject(subjectId: string): Promise<ResolvedSubject | null> {
  const file = await db.publishedFile.findUnique({
    where: { id: subjectId },
    select: { slug: true, profile: { select: { userId: true, user: { select: { username: true } } } } },
  });
  const handle = file?.profile.user.username?.handle;
  if (!file || !handle) return null;
  return { ownerId: file.profile.userId, path: `${handle}/files/${file.slug}` };
}

// phase-8 spec §8.1: the first phase to actually reuse the generalized
// primitive for a new content type since it was introduced. subjectId is
// the Event's id (not its slug, unlike every other resolver here) since
// toggleReaction/createComment are called with whatever the caller already
// has in hand from the page — the event detail page already has the row
// loaded by id, so no extra lookup is needed to resolve id -> slug first.
// ownerId is always Event.createdBy — never null, unlike WikiPage's
// community-owned case, since createdBy is guaranteed set regardless of
// which of the three host types is set (build plan §4).
async function resolveEventSubject(subjectId: string): Promise<ResolvedSubject | null> {
  const event = await db.event.findUnique({
    where: { id: subjectId },
    select: { slug: true, createdBy: true },
  });
  if (!event) return null;
  return { ownerId: event.createdBy, path: `e/${event.slug}` };
}

const SUBJECT_RESOLVERS: Record<string, (subjectId: string) => Promise<ResolvedSubject | null>> = {
  article: resolveArticleSubject,
  wiki_page: resolveWikiPageSubject,
  book: resolveBookSubject,
  published_file: resolvePublishedFileSubject,
  event: resolveEventSubject,
};

async function resolveSubject(subjectType: string, subjectId: string): Promise<ResolvedSubject | null> {
  const resolver = SUBJECT_RESOLVERS[subjectType];
  return resolver ? resolver(subjectId) : null;
}

function checkCommentRateLimit(userId: string): boolean {
  return checkRateLimit(`reaction:comment:user:${userId}`, { max: 20, windowMs: 5 * 60 * 1000 });
}

// Mirrors toggleProjectLike (projects.ts): same-transaction create/delete +
// increment/decrement (where a cached counter exists), notification fired
// after the transaction commits.
export async function toggleReaction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const subjectType = String(formData.get("subjectType") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");

  const subject = await resolveSubject(subjectType, subjectId);
  if (!subject) return;

  const existing = await db.reaction.findUnique({
    where: { subjectType_subjectId_userId: { subjectType, subjectId, userId: user.id } },
  });

  if (existing) {
    await db.$transaction([
      db.reaction.delete({ where: { subjectType_subjectId_userId: { subjectType, subjectId, userId: user.id } } }),
      ...(subject.bumpLike ? [subject.bumpLike(-1)] : []),
    ]);
  } else {
    await db.$transaction([
      db.reaction.create({ data: { subjectType, subjectId, userId: user.id } }),
      ...(subject.bumpLike ? [subject.bumpLike(1)] : []),
    ]);
    if (subject.ownerId) {
      await notifyReactionLike({ recipientId: subject.ownerId, actorId: user.id, subjectType, path: subject.path });
    }
  }

  revalidatePath(`/${subject.path}`);
}

export async function createComment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const subjectType = String(formData.get("subjectType") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1 || body.length > 1000) return { error: "Comment must be 1-1000 characters." };

  const subject = await resolveSubject(subjectType, subjectId);
  if (!subject) return { error: "Not found." };

  if (!checkCommentRateLimit(user.id)) {
    return { error: "You're commenting too fast. Please slow down." };
  }

  await db.$transaction([
    db.comment.create({ data: { subjectType, subjectId, authorId: user.id, body } }),
    ...(subject.bumpComment ? [subject.bumpComment(1)] : []),
  ]);
  if (subject.ownerId) {
    await notifyReactionComment({ recipientId: subject.ownerId, actorId: user.id, subjectType, path: subject.path });
  }

  revalidatePath(`/${subject.path}`);
  return undefined;
}

// Soft-deleted, same posture as ProjectComment/Post.
export async function deleteComment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const commentId = String(formData.get("commentId") ?? "");
  if (!commentId) return;

  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.deletedAt) return;

  const subject = await resolveSubject(comment.subjectType, comment.subjectId);
  if (!subject) return;
  if (comment.authorId !== user.id && subject.ownerId !== user.id) return;

  await db.$transaction([
    db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
    ...(subject.bumpComment ? [subject.bumpComment(-1)] : []),
  ]);
  revalidatePath(`/${subject.path}`);
}
