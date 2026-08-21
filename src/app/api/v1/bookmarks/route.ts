import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { parseCursor, encodeCursor, POST_PAGE_SIZE } from "@/lib/pagination";

// Bookmark's primary key is the composite (postId, userId) — no scalar `id`
// field for pagination.ts's cursorWhere/paginate to key off, so cursoring
// here is by (createdAt, postId) directly rather than forcing the generic
// helper's `id` field name onto a model that doesn't have one. Still the
// same opaque "<iso>~<id>" cursor shape and fetch-one-extra pattern.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);

  const rows = await db.bookmark.findMany({
    where: {
      userId: ctx.userId,
      post: { deletedAt: null },
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, postId: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { post: { include: { author: { include: { username: true, profile: true } }, media: { orderBy: { position: "asc" } } } } },
  });

  const hasMore = rows.length > POST_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, POST_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].postId }) : null;

  const postIds = page.map((row) => row.postId);
  const likedPostIds = await db.postLike
    .findMany({ where: { userId: ctx.userId, postId: { in: postIds } }, select: { postId: true } })
    .then((found) => new Set(found.map((row) => row.postId)));

  return Response.json(
    {
      items: page.map((row) => ({
        id: row.post.id,
        body: row.post.body,
        author: row.post.author.username?.handle ?? null,
        authorDisplayName: row.post.author.profile?.displayName ?? null,
        authorAvatarUrl: row.post.author.profile?.avatarUrl ?? null,
        authorVerified: row.post.author.profile?.isVerified ?? false,
        likeCount: row.post.likeCount,
        replyCount: row.post.replyCount,
        repostCount: row.post.repostCount,
        isLiked: likedPostIds.has(row.post.id),
        isBookmarked: true,
        media: row.post.media.map((m) => ({ url: m.url, position: m.position })),
        createdAt: row.post.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
