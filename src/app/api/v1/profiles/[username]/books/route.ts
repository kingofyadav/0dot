import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

// Bearer-token counterpart to src/app/[username]/books/page.tsx — same
// published+public-only scope.
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const books = await db.book.findMany({
    where: { profileId: username.user.profile.id, status: "published", visibility: "public" },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(
    {
      items: books.map((book) => ({
        id: book.id,
        slug: book.slug,
        title: book.title,
        description: book.description,
        coverImageUrl: book.coverImageUrl,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
