import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";

// Same pattern as v1/wallet/transfer and v1/account/password's schemas —
// empty string for a missing/non-string field, requireCurrentPassword does
// the actual rejection.
const disable2faSchema = z.object({
  currentPassword: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
});

export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!(await enforceRateLimit(`2fa-disable:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const { currentPassword } = disable2faSchema.parse(payload ?? {});

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  await db.$transaction([
    db.user.update({ where: { id: ctx.userId }, data: { twoFactorSecret: null, twoFactorEnabledAt: null } }),
    db.twoFactorRecoveryCode.deleteMany({ where: { userId: ctx.userId } }),
  ]);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
