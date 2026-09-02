import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasTierAccess } from "@/lib/tier-access";
import { parseCursor, cursorWhere, paginate, POST_PAGE_SIZE } from "@/lib/pagination";

// Bearer-token counterpart to the recent-messages fetch
// src/app/live/[livestreamId]/page.tsx does directly via Prisma — same
// access gate sendChatMessage/the SSE route apply (spec §8.3's second
// criterion extended to viewing chat, not just the stream). Most-recent-
// first, same convention as the community-chat history route
// (v1/communities/[slug]/chat/route.ts) — an inverted FlatList renders
// newest at the bottom.
export async function GET(request: Request, { params }: { params: Promise<{ livestreamId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "livestreams:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { livestreamId } = await params;
  const livestream = await db.livestream.findUnique({
    where: { id: livestreamId },
    select: { id: true, creatorId: true, requiredTierId: true },
  });
  if (!livestream) return apiError("Not found.", 404);

  if (livestream.requiredTierId) {
    const hasAccess = await hasTierAccess(ctx.userId, livestream.creatorId, livestream.requiredTierId);
    if (!hasAccess) return apiError("You don't have access to this livestream's chat.", 403);
  }

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const rows = await db.livestreamChatMessage.findMany({
    where: { livestreamId, deletedAt: null, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { sender: { include: { username: true, profile: true } } },
  });
  const { items, nextCursor } = paginate(rows);

  return Response.json(
    {
      items: items.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        sender: {
          username: m.sender.username?.handle ?? null,
          displayName: m.sender.profile?.displayName ?? null,
          avatarUrl: m.sender.profile?.avatarUrl ?? null,
        },
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
