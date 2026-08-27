import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";

const DEACTIVATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Bearer-token counterpart to deactivateAccount/requestAccountDeletion
// (account-lifecycle.ts) — both web actions are the same state transition
// (see that file's own scheduleDeactivation comment), so this one route
// backs both mobile screens' actions; the client picks the confirmation
// copy. No explicit sign-out call needed here either: resolveApiRequest's
// own User.status check (this addendum's finding 1 fix) already rejects
// this account's existing bearer tokens on their very next use.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!(await enforceRateLimit(`account-lifecycle:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  await db.user.update({
    where: { id: ctx.userId },
    data: { status: "deactivated", deletionScheduledFor: new Date(Date.now() + DEACTIVATION_GRACE_MS) },
  });

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
