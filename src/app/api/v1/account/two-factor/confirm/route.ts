import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTotpCode, generateRecoveryCodes, storeRecoveryCodes } from "@/lib/two-factor";

// Bearer-token counterpart to confirmTwoFactorEnrollment (two-factor.ts) —
// same per-user rate-limit bucket key that action uses, so an app hammering
// this via the API shares the same throttle as a web attempt would.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!checkRateLimit(`2fa-enroll:user:${ctx.userId}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const code = typeof payload?.code === "string" ? payload.code : "";

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret) return apiError("Start enrollment before confirming a code.", 400);

  if (!(await verifyTotpCode(user.twoFactorSecret, code))) {
    return apiError("That code didn't match. Check your authenticator app and try again.", 400);
  }

  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({ where: { id: ctx.userId }, data: { twoFactorEnabledAt: new Date() } });
  await storeRecoveryCodes(ctx.userId, recoveryCodes);

  return Response.json(
    { recoveryCodes },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
