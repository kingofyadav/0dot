import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Bearer-token counterpart to exportAccountData (account-lifecycle.ts) and
// GET /api/account/export — that action self-authenticates via
// requireVerifiedUser() (cookie session) and takes no userId parameter, so
// it's reimplemented against ctx.userId here rather than called directly;
// same queries, same scope (cheap-to-query tables, not every table this
// schema has).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({ where: { id: ctx.userId } });
  if (!user) return apiError("Not found.", 404);

  const [profile, links, posts, articles, projects, bookmarks] = await Promise.all([
    db.profile.findUnique({ where: { userId: ctx.userId } }),
    db.link.findMany({ where: { profile: { userId: ctx.userId } } }),
    db.post.findMany({ where: { authorId: ctx.userId, deletedAt: null }, select: { id: true, body: true, createdAt: true } }),
    db.article.findMany({ where: { authorId: ctx.userId }, select: { id: true, title: true, format: true, status: true, createdAt: true } }),
    db.project.findMany({ where: { ownerId: ctx.userId }, select: { id: true, title: true, description: true, startedAt: true } }),
    db.bookmark.findMany({ where: { userId: ctx.userId }, select: { postId: true, createdAt: true } }),
  ]);

  const data = {
    account: {
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      locale: user.locale,
      timezone: user.timezone,
      createdAt: user.createdAt,
    },
    profile,
    links,
    posts,
    articles,
    projects,
    bookmarks,
    exportedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=0dot-account-export.json",
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
    },
  });
}
