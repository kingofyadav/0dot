import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// M12 (settings/account parity): bearer-token counterpart to
// security/sessions/page.tsx. "Sessions" here means web/cookie sessions
// (db.session) only — mobile's own access is a separate OAuthAuthorization,
// never a Session row, so there's no "this device" entry to tag in this
// list (see this addendum's own note on that distinction). Login history is
// folded into this same response rather than a second route/round-trip,
// same "one screen, one call" economy notification-preferences.ts already
// uses for its push+email+deviceCount payload.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const [sessions, loginEvents] = await Promise.all([
    db.session.findMany({
      where: { userId: ctx.userId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, lastSeenAt: true, createdAt: true },
    }),
    db.loginEvent.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, ipAddress: true, userAgent: true, success: true, method: true },
    }),
  ]);

  return Response.json(
    { sessions, loginEvents },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
