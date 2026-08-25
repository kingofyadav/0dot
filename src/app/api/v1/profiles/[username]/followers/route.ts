import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";

// Mobile pro-upgrade addendum, sub-phase M13. Mirrors
// src/app/[username]/followers/page.tsx exactly — same private-account
// gate (owner or an accepted Follow row required), same composite-PK
// (followerId, followeeId) cursor pagination `bookmarks/route.ts` already
// established the pattern for — just returned as JSON instead of
// server-rendered HTML. `profile:read` already covers viewing
// profile-adjacent info (the web page itself needs no extra permission
// beyond being logged in, or nothing at all if public), so no new scope.
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
      followeeId: username.userId,
      status: "accepted",
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, followerId: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followerId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { follower: { include: { username: true, profile: true } } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.followerId })));

  return Response.json(
    {
      // A user without a claimed username (Username is optional on User)
      // has no profile URL for the mobile UserRow to navigate to, so
      // they're excluded here rather than surfaced with a null handle.
      items: items.flatMap((row) => {
        const handle = row.follower.username?.handle;
        if (!handle) return [];
        return [
          {
            username: handle,
            displayName: row.follower.profile?.displayName ?? handle,
            avatarUrl: row.follower.profile?.avatarUrl ?? null,
            isVerified: row.follower.profile?.isVerified ?? false,
          },
        ];
      }),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
