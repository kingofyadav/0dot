import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { getFeedPosts } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";

// Mobile Phase C's "Posts" profile tab — same getFeedPosts helper the main
// feed route already uses, just scoped to one author via authorFilter
// (exactly how [username]/page.tsx builds its own posts list), not a
// second query implementation to keep in sync with the real one.
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({ where: { handle } });
  if (!username) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const { items, nextCursor } = await getFeedPosts({
    authorFilter: { authorId: { in: [username.userId] } },
    cursor,
    viewerId: ctx.userId,
  });

  const [likedPostIds, bookmarkedPostIds] = await Promise.all([
    db.postLike
      .findMany({ where: { userId: ctx.userId, postId: { in: items.map((p) => p.id) } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
    db.bookmark
      .findMany({ where: { userId: ctx.userId, postId: { in: items.map((p) => p.id) } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
  ]);

  return Response.json(
    {
      items: items.map((post) => ({
        id: post.id,
        body: post.body,
        author: post.author.username?.handle ?? null,
        authorDisplayName: post.author.profile?.displayName ?? null,
        authorAvatarUrl: post.author.profile?.avatarUrl ?? null,
        authorVerified: post.author.profile?.isVerified ?? false,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        repostCount: post.repostCount,
        isLiked: likedPostIds.has(post.id),
        isBookmarked: bookmarkedPostIds.has(post.id),
        media: post.media.map((m) => ({ url: m.url, position: m.position })),
        createdAt: post.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
