import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { parseCursor, cursorWhere, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { getNotificationVerb, getNotificationHref } from "@/lib/notifications";

const actorInclude = { username: true, profile: true } as const;

export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "notifications:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const recipient = await db.user.findUnique({ where: { id: ctx.userId }, include: { username: true } });
  const recipientHandle = recipient?.username?.handle ?? null;

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const rows = await db.notification.findMany({
    where: { recipientId: ctx.userId, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { actor: { include: actorInclude } },
  });
  const { items, nextCursor } = paginate(rows);

  return Response.json(
    {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        subjectType: n.subjectType,
        subjectId: n.subjectId,
        verb: getNotificationVerb(n.type, n.subjectType),
        href: getNotificationHref(n, recipientHandle),
        actor: n.actor
          ? { username: n.actor.username?.handle ?? null, displayName: n.actor.profile?.displayName ?? null }
          : null,
        isRead: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function PATCH(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "notifications:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  await db.notification.updateMany({ where: { recipientId: ctx.userId, readAt: null }, data: { readAt: new Date() } });

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
