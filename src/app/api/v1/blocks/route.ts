import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { blockUserById } from "@/app/actions/block";

// Bearer-token counterpart to /s/[username]/blocked/page.tsx — same
// cursor-pagination shape (Block's composite PK has no scalar `id`, so
// blockedId is relabeled to `id` before paginate(), same trick that page
// already uses).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "privacy:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);

  const rows = await db.block.findMany({
    where: {
      blockerId: ctx.userId,
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, blockedId: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { blockedId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { blocked: { include: { username: true, profile: true } } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.blockedId })));

  return Response.json(
    {
      items: items.map((r) => ({
        userId: r.blocked.id,
        username: r.blocked.username?.handle ?? null,
        displayName: r.blocked.profile?.displayName ?? null,
        avatarUrl: r.blocked.profile?.avatarUrl ?? null,
        blockedAt: r.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "privacy:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const payload = await request.json().catch(() => null);
  const username = (typeof payload?.username === "string" ? payload.username : "").trim().toLowerCase();
  if (!username) return apiError("username is required.", 400);

  // Keyed by username, not a raw userId, matching every other mobile
  // profile-scoped write (POST /profiles/[username]/follow) — a mobile
  // client viewing a profile only ever has its username, same as the
  // profile-detail route's own {username} param.
  const target = await db.username.findUnique({ where: { handle: username }, select: { userId: true } });
  if (!target) return apiError("Not found.", 404);

  await blockUserById(ctx.userId, target.userId);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
