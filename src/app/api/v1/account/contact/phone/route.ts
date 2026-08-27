import { randomInt, createHash } from "crypto";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSmsSender } from "@/lib/sms";
import { toE164 } from "@/lib/country-codes";

const PHONE_CHANGE_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Bearer-token counterpart to requestPhoneChange (account-contact.ts).
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!(await enforceRateLimit(`phone-change:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
  const phoneDialCode = typeof payload?.phoneDialCode === "string" ? payload.phoneDialCode : "";
  const phoneNumber = typeof payload?.phoneNumber === "string" ? payload.phoneNumber : "";

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  const newPhone = toE164(phoneDialCode, phoneNumber);
  if (!newPhone) return apiError("Enter a valid mobile number.", 400);

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { phone: true } });
  if (!user) return apiError("Not found.", 404);
  if (newPhone === user.phone) return apiError("That's already your current mobile number.", 400);

  const existing = await db.user.findUnique({ where: { phone: newPhone } });
  if (existing) return apiError("An account with that mobile number already exists.", 400);

  await db.pendingPhoneChange.deleteMany({ where: { userId: ctx.userId } });

  const code = String(randomInt(100000, 1000000));
  await db.pendingPhoneChange.create({
    data: { userId: ctx.userId, newPhone, codeHash: hashCode(code), expiresAt: new Date(Date.now() + PHONE_CHANGE_TTL_MS) },
  });

  await getSmsSender().send({ to: newPhone, body: `Your 0dot.in verification code is ${code}` });

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
