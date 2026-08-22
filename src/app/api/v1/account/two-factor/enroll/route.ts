import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { generateSecret, buildEnrollmentUri } from "@/lib/two-factor";

// Bearer-token counterpart to startTwoFactorEnrollment
// (src/app/actions/two-factor.ts) — same lib/two-factor.ts primitives, the
// requireVerifiedUser()-and-plain-return shape reimplemented against
// ctx.userId since that action's own gate reads a cookie session.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, twoFactorEnabledAt: true } });
  if (!user) return apiError("Not found.", 404);
  if (user.twoFactorEnabledAt) return apiError("Two-factor authentication is already enabled.", 400);

  const secret = generateSecret();
  await db.user.update({ where: { id: ctx.userId }, data: { twoFactorSecret: secret } });

  const { otpauthUrl, qrDataUrl } = await buildEnrollmentUri(secret, user.email);

  return Response.json(
    { otpauthUrl, qrDataUrl },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
