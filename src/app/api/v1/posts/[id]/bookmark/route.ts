import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { revalidatePath } from "next/cache";

// Toggle, mirroring actions/posts.ts's toggleBookmark and this same
// directory's like/repost routes — a second call un-bookmarks rather than
// erroring. No count in the response: bookmark counts are never public
// (phase-1 spec §5.3), unlike likeCount/repostCount.
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
  const post = await db.post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true } });
  if (!post) return apiError("Not found.", 404);

  const existing = await db.bookmark.findUnique({ where: { postId_userId: { postId, userId: ctx.userId } } });
  let bookmarked: boolean;
  if (existing) {
    await db.bookmark.delete({ where: { postId_userId: { postId, userId: ctx.userId } } });
    bookmarked = false;
  } else {
    await db.bookmark.create({ data: { postId, userId: ctx.userId } });
    bookmarked = true;
  }

  revalidatePath("/feed");
  revalidatePath("/explore");
  revalidatePath("/bookmarks");

  return Response.json(
    { bookmarked },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
