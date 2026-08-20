import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { revalidatePath } from "next/cache";

// Plain-repost toggle only, mirroring actions/posts.ts's toggleRepost —
// quote-reposts (createQuoteRepost) need their own compose UI and stay
// web-only for now, same scoping decision as the compose route's
// text-only, no-media posture.
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
  const original = await db.post.findFirst({ where: { id: postId, deletedAt: null }, select: { repostCount: true } });
  if (!original) return apiError("Not found.", 404);

  // Read + write in one transaction (not just the write) — two concurrent
  // toggles could otherwise both read "not reposted yet" before either
  // commits, same race the web action's own comment flags.
  const reposted = await db.$transaction(async (tx) => {
    const existing = await tx.post.findFirst({
      where: { authorId: ctx.userId, repostOfId: postId, body: "", deletedAt: null },
    });
    if (existing) {
      await tx.post.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      await tx.post.update({ where: { id: postId }, data: { repostCount: { decrement: 1 } } });
      return false;
    }
    await tx.post.create({ data: { authorId: ctx.userId, body: "", repostOfId: postId } });
    await tx.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } });
    return true;
  });

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { username: { select: { handle: true } } } });
  revalidatePath("/feed");
  revalidatePath("/explore");
  if (user?.username?.handle) revalidatePath(`/${user.username.handle}`);

  return Response.json(
    { reposted, repostCount: original.repostCount + (reposted ? 1 : -1) },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
