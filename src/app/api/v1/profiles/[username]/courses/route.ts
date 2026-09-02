import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

// Bearer-token counterpart to src/app/[username]/courses/page.tsx — Course
// has no `visibility` field (unlike Article); status "active" is the only
// public-facing state.
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

  const courses = await db.course.findMany({
    where: { creatorId: username.userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(
    {
      items: courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        price: course.price,
        currency: course.currency,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
