import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };

// Bearer-token counterpart to src/app/[username]/articles/page.tsx — same
// "always public+published only, regardless of viewer" scope (unlisted is
// direct-link-only, private never appears here, same as that page). No
// cursor here, matching the web page's own choice not to paginate this
// list — capped at 50 as a sane upper bound instead.
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({ where: { handle } });
  if (!username) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const articles = await db.article.findMany({
    where: { authorId: username.userId, status: "published", visibility: "public" },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return Response.json(
    {
      items: articles.map((article) => ({
        id: article.id,
        slug: article.slug,
        title: article.title,
        subtitle: article.subtitle,
        format: article.format,
        formatLabel: FORMAT_LABEL[article.format] ?? article.format,
        coverImageUrl: article.coverImageUrl,
        readingTimeMinutes: article.readingTimeMinutes,
        publishedAt: article.publishedAt,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
