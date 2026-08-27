import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateRecoveryCodes, storeRecoveryCodes } from "@/lib/two-factor";

export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!(await enforceRateLimit(`2fa-regen:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { twoFactorEnabledAt: true } });
  if (!user?.twoFactorEnabledAt) return apiError("Two-factor authentication isn't enabled.", 400);

  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  const recoveryCodes = generateRecoveryCodes();
  await storeRecoveryCodes(ctx.userId, recoveryCodes);

  return Response.json(
    { recoveryCodes },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
