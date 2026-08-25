import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { softDeletePostAndDecrementCounts } from "@/lib/post-moderation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { id } = await params;
  const post = await db.post.findUnique({
    where: { id },
    include: { author: { include: { username: true, profile: true } }, media: { orderBy: { position: "asc" } } },
  });
  if (!post || post.deletedAt) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, post.authorId)) return apiError("Not found.", 404);

  const [isLiked, isBookmarked] = await Promise.all([
    db.postLike.findUnique({ where: { postId_userId: { postId: id, userId: ctx.userId } } }).then((row) => row !== null),
    db.bookmark.findUnique({ where: { postId_userId: { postId: id, userId: ctx.userId } } }).then((row) => row !== null),
  ]);

  return Response.json(
    {
      id: post.id,
      body: post.body,
      author: post.author.username?.handle ?? null,
      authorDisplayName: post.author.profile?.displayName ?? null,
      authorAvatarUrl: post.author.profile?.avatarUrl ?? null,
      authorVerified: post.author.profile?.isVerified ?? false,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
      repostCount: post.repostCount,
      isLiked,
      isBookmarked,
      media: post.media.map((m) => ({ url: m.url, position: m.position })),
      createdAt: post.createdAt,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Mobile pro-upgrade addendum, sub-phase M13 (long-press quick actions).
// Mirrors actions/posts.ts's deletePost exactly — same author-only +
// not-already-deleted lookup, same shared softDeletePostAndDecrementCounts
// tombstone (reused, not reimplemented — see that function's own comment
// on why it can't do its own auth check and must live outside a "use
// server" file).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { id } = await params;
  const post = await db.post.findFirst({ where: { id, authorId: ctx.userId, deletedAt: null } });
  if (!post) return apiError("Not found.", 404);

  await softDeletePostAndDecrementCounts(post);

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
