import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };

// Bearer-token counterpart to src/app/[username]/articles/[slug]/page.tsx.
// Access gate mirrors that page exactly: owner sees it regardless of
// status/visibility, everyone else only if published and not private
// (unlisted+published is direct-link/API-reachable, just excluded from the
// list route above — same "obscurity via omission from listings" posture
// as Project's own `unlisted`). Note: Article has no requiredTierId — it's
// gated by status/visibility, not membership tier (unlike Livestream/
// Course), so there's no hasTierAccess call here.
// v1 scope: reading only — comments, likes, hashtag editing, and
// translation stay web-only for now, same as this route's sibling content
// endpoints.
export async function GET(request: Request, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle } });
  if (!username) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const article = await db.article.findUnique({
    where: { authorId_slug: { authorId: username.userId, slug } },
    include: { hashtags: { include: { hashtag: true } } },
  });
  if (!article) return apiError("Not found.", 404);

  const isOwner = ctx.userId === article.authorId;
  if (!isOwner && (article.status !== "published" || article.visibility === "private")) {
    return apiError("Not found.", 404);
  }

  return Response.json(
    {
      id: article.id,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle,
      format: article.format,
      formatLabel: FORMAT_LABEL[article.format] ?? article.format,
      body: article.body,
      coverImageUrl: article.coverImageUrl,
      readingTimeMinutes: article.readingTimeMinutes,
      status: article.status,
      visibility: article.visibility,
      likeCount: article.likeCount,
      commentCount: article.commentCount,
      publishedAt: article.publishedAt,
      isOwner,
      hashtags: article.hashtags.map((h) => h.hashtag.name),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
