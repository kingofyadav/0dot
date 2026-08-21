import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getPostVisibilityConditions } from "@/lib/post-visibility";
import { cursorWhere, paginate, parseCursor } from "@/lib/pagination";

// Mobile pro-upgrade addendum, sub-phase M2. Deliberately narrower than
// search/page.tsx's 8 tabs (users/posts/communities/businesses/projects/
// knowledge/events/marketplace) — communities/businesses/events/marketplace
// don't have a mobile screen or OAuth scope yet (later sub-phases), so
// exposing their search results here would be a dead end with nothing to
// navigate to. Mirrors that page's own query shape and gating exactly
// (same discoverableInSearch flag, same getPostVisibilityConditions,
// same exact-match-first ranking) rather than inventing a second ranking
// philosophy for the same two entity types.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") === "users" ? "users" : "posts";
  if (!q) return apiError("A search query is required.", 400);

  const scopeError = requireScope(ctx, type === "users" ? "profile:read" : "posts:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (type === "users") {
    const lowerQ = q.toLowerCase();
    const rows = await db.username.findMany({
      where: {
        AND: [
          { OR: [{ handle: { contains: lowerQ } }, { user: { profile: { displayName: { contains: q } } } }] },
          { user: { profile: { discoverableInSearch: true } } },
        ],
      },
      include: { user: { include: { profile: true } } },
      take: 20,
    });
    const ranked = rows.slice().sort((a, b) => {
      const rank = (row: (typeof rows)[number]) => {
        if (row.handle === lowerQ) return 0;
        if (row.handle.startsWith(lowerQ)) return 1;
        return 2;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return Number(!a.user.profile?.isVerified) - Number(!b.user.profile?.isVerified);
    });

    return Response.json(
      {
        items: ranked.map((row) => ({
          username: row.handle,
          displayName: row.user.profile?.displayName ?? row.handle,
          avatarUrl: row.user.profile?.avatarUrl ?? null,
          isVerified: row.user.profile?.isVerified ?? false,
        })),
      },
      { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const query = q.startsWith("#") ? q.slice(1) : q;
  if (query.length === 0) {
    return Response.json({ items: [], nextCursor: null }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
  }
  const cursor = parseCursor(url.searchParams.get("cursor") ?? undefined);
  const visibilityConditions = await getPostVisibilityConditions(ctx.userId);
  const rows = await db.post.findMany({
    where: { AND: [{ deletedAt: null, replyToId: null, body: { contains: query } }, ...visibilityConditions, cursorWhere(cursor)] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 21,
    include: { author: { include: { profile: true, username: true } }, media: { orderBy: { position: "asc" } } },
  });
  const { items, nextCursor } = paginate(rows);

  const [likedPostIds, bookmarkedPostIds] = await Promise.all([
    db.postLike
      .findMany({ where: { userId: ctx.userId, postId: { in: items.map((p) => p.id) } }, select: { postId: true } })
      .then((found) => new Set(found.map((r) => r.postId))),
    db.bookmark
      .findMany({ where: { userId: ctx.userId, postId: { in: items.map((p) => p.id) } }, select: { postId: true } })
      .then((found) => new Set(found.map((r) => r.postId))),
  ]);

  return Response.json(
    {
      items: items.map((post) => ({
        id: post.id,
        body: post.body,
        author: post.author.username?.handle ?? null,
        authorDisplayName: post.author.profile?.displayName ?? null,
        authorAvatarUrl: post.author.profile?.avatarUrl ?? null,
        authorVerified: post.author.profile?.isVerified ?? false,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        repostCount: post.repostCount,
        isLiked: likedPostIds.has(post.id),
        isBookmarked: bookmarkedPostIds.has(post.id),
        media: post.media.map((m) => ({ url: m.url, position: m.position })),
        createdAt: post.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
