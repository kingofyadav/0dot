import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { notifyLike } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

// Toggle, mirroring actions/posts.ts's toggleLike — a second call un-likes
// rather than erroring, same idempotent-toggle posture as the web action.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "engagement:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { id: postId } = await params;
  const [existing, post] = await Promise.all([
    db.postLike.findUnique({ where: { postId_userId: { postId, userId: ctx.userId } } }),
    db.post.findFirst({ where: { id: postId, deletedAt: null }, select: { authorId: true, likeCount: true } }),
  ]);
  if (!post) return apiError("Not found.", 404);

  let liked: boolean;
  let likeCount: number;
  if (existing) {
    await db.$transaction([
      db.postLike.delete({ where: { postId_userId: { postId, userId: ctx.userId } } }),
      db.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ]);
    liked = false;
    likeCount = post.likeCount - 1;
  } else {
    await db.$transaction([
      db.postLike.create({ data: { postId, userId: ctx.userId } }),
      db.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
    await notifyLike({ recipientId: post.authorId, actorId: ctx.userId, subjectId: postId });
    liked = true;
    likeCount = post.likeCount + 1;
  }

  revalidatePath("/feed");
  revalidatePath("/explore");

  return Response.json(
    { liked, likeCount },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
