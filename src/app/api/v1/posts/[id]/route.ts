import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { id } = await params;
  const post = await db.post.findUnique({ where: { id }, include: { author: { include: { username: true } } } });
  if (!post || post.deletedAt) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, post.authorId)) return apiError("Not found.", 404);

  return Response.json(
    {
      id: post.id,
      body: post.body,
      author: post.author.username?.handle ?? null,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
      repostCount: post.repostCount,
      createdAt: post.createdAt,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
