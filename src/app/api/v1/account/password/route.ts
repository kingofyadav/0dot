import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { revokeAllOtherSessions } from "@/app/actions/session-management";

// Same "" for a missing/non-string field pattern as
// v1/wallet/transfer/route.ts — the actual length/equality checks below are
// unchanged business rules, not schema constraints, so an empty string is a
// valid parse here and gets rejected by requireCurrentPassword/the length
// check instead, same as the old typeof-checked version did.
const stringOrEmpty = z.preprocess((v) => (typeof v === "string" ? v : ""), z.string());
const changePasswordSchema = z.object({ currentPassword: stringOrEmpty, newPassword: stringOrEmpty });

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

  if (!(await enforceRateLimit(`change-password:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const { currentPassword, newPassword } = changePasswordSchema.parse(payload ?? {});

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
