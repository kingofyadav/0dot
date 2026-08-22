import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { revokeAllOtherSessions } from "@/app/actions/session-management";

// Bearer-token counterpart to changePassword (src/app/actions/auth.ts) —
// same validation and same revokeAllOtherSessions call after a successful
// change (a credential change should still kill every open web session,
// regardless of which client made the change).
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!checkRateLimit(`change-password:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 })) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  if (newPassword.length < 8) return apiError("Password must be at least 8 characters.", 400);
  if (newPassword === currentPassword) return apiError("New password must be different from your current one.", 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: ctx.userId }, data: { passwordHash } });
  await revokeAllOtherSessions(ctx.userId);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
