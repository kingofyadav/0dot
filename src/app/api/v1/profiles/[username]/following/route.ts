import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";

// Mirror of ../followers/route.ts, filtered/tiebroken the other direction —
// see that file's comment for the shared reasoning (mirrors
// src/app/[username]/following/page.tsx exactly).
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawUsername } = await params;
  const handle = decodeURIComponent(rawUsername).toLowerCase();
  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);

  const isOwner = ctx.userId === username.userId;
  if (username.user.profile.isPrivate && !isOwner) {
    const viewerFollowRow = await db.follow.findUnique({
      where: { followerId_followeeId: { followerId: ctx.userId, followeeId: username.userId } },
      select: { status: true },
    });
    if (viewerFollowRow?.status !== "accepted") return apiError("Not found.", 404);
  }

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const rows = await db.follow.findMany({
    where: {
      followerId: username.userId,
      status: "accepted",
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, followeeId: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followeeId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { followee: { include: { username: true, profile: true } } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.followeeId })));

  return Response.json(
    {
      // Same "no username, no navigable profile" exclusion as
      // ../followers/route.ts — see that file's comment.
      items: items.flatMap((row) => {
        const handle = row.followee.username?.handle;
        if (!handle) return [];
        return [
          {
            username: handle,
            displayName: row.followee.profile?.displayName ?? handle,
            avatarUrl: row.followee.profile?.avatarUrl ?? null,
            isVerified: row.followee.profile?.isVerified ?? false,
          },
        ];
      }),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
