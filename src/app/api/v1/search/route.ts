import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getPostVisibilityConditions } from "@/lib/post-visibility";
import { cursorWhere, paginate, parseCursor } from "@/lib/pagination";
import { searchCommunities, searchBusinesses, searchEvents } from "@/lib/search";
import { fetchAllMarketplaceCategories } from "@/lib/marketplace-browse";

const TYPES = ["users", "posts", "communities", "businesses", "events", "marketplace"] as const;
type SearchType = (typeof TYPES)[number];
const SCOPE_BY_TYPE: Record<SearchType, string> = {
  users: "profile:read",
  posts: "posts:read",
  communities: "communities:read",
  businesses: "businesses:read",
  events: "events:read",
  marketplace: "marketplace:read",
};

// Mobile pro-upgrade addendum, sub-phase M2 (users/posts), widened in M13
// to the remaining four types now that M4-M6 gave mobile a screen each
// result type can navigate into (this route's own original comment named
// exactly that as the reason they were left out — no longer true). Still
// narrower than search/page.tsx's 8 tabs: projects and knowledge have no
// mobile screen yet, so stay excluded for the same reason communities/
// businesses/events/marketplace originally were. communities/businesses/
// events reuse the *exact* query+rank logic search/page.tsx itself calls
// (extracted to lib/search.ts this same sub-phase so there's one
// implementation, not two); marketplace reuses fetchAllMarketplaceCategories
// directly, the same function GET /api/v1/marketplace already wraps.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const rawType = url.searchParams.get("type");
  const type: SearchType = (TYPES as readonly string[]).includes(rawType ?? "") ? (rawType as SearchType) : "posts";
  if (!q) return apiError("A search query is required.", 400);

  const scopeError = requireScope(ctx, SCOPE_BY_TYPE[type]);
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);
  const rateLimitHeaders = { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) };

  if (type === "communities") {
    const rows = await searchCommunities(q);
    return Response.json(
      {
        items: rows.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          avatarUrl: c.avatarUrl,
          memberCount: c.memberCount,
          visibility: c.visibility,
        })),
      },
      { headers: rateLimitHeaders }
    );
  }

  if (type === "businesses") {
    const rows = await searchBusinesses(q);
    return Response.json(
      {
        items: rows.map((b) => ({
          slug: b.slug,
          name: b.name,
          logoUrl: b.logoUrl,
          category: b.category,
          status: b.status,
          isVerified: b.isVerified,
        })),
      },
      { headers: rateLimitHeaders }
    );
  }

  if (type === "events") {
    // Search results show a lighter row than the full events list screen
    // (title + date only, no host/cover) — listUpcomingEvents' host join
    // isn't part of searchEvents' own query shape (see lib/search.ts), and
    // adding it here would mean the search route diverging from what the
    // web search page itself actually selects. Tapping a result still
    // opens the real event detail screen, which shows the rest.
    const rows = await searchEvents(q, "upcoming");
    return Response.json(
      { items: rows.map((e) => ({ slug: e.slug, title: e.title, startsAt: e.startsAt })) },
      { headers: rateLimitHeaders }
    );
  }

  if (type === "marketplace") {
    const items = await fetchAllMarketplaceCategories(q);
    return Response.json(
      {
        items: items.map((item) => ({
          category: item.category,
          categoryLabel: item.categoryLabel,
          id: item.id,
          href: item.href,
          title: item.title,
          subtitle: item.subtitle,
          priceLabel: item.priceLabel,
        })),
      },
      { headers: rateLimitHeaders }
    );
  }

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
