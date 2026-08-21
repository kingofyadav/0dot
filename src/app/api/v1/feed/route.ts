import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getFeedPosts } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";

export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const { items, nextCursor } = await getFeedPosts({ cursor, viewerId: ctx.userId });

  // Same batch-query shape feed/page.tsx already uses for the web feed
  // (one findMany + a Set, not N per-post lookups) so a like toggle
  // rendered on mobile reflects the viewer's real state, not always "not
  // liked" until the app re-derives it from a local toggle.
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
