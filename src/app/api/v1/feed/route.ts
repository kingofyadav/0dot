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

  return Response.json(
    {
      items: items.map((post) => ({
        id: post.id,
        body: post.body,
        author: post.author.username?.handle ?? null,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        repostCount: post.repostCount,
        createdAt: post.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
