import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, requireCurrentPassword, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getEmailSender, getAppOrigin, renderEmailChangeEmailHtml } from "@/lib/email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

// Same pattern as v1/wallet/transfer and v1/account/password's schemas —
// empty string for a missing/non-string field; the EMAIL_PATTERN test
// below (not a schema constraint) is what actually rejects a bad address,
// same business-rule split as the old typeof-checked version.
const changeEmailSchema = z.object({
  currentPassword: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  newEmail: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""), z.string()),
});

// Bearer-token counterpart to requestEmailChange (account-contact.ts) — the
// verification link still lands on the web app's own
// /verify-email-change page (opened from the mail client, same as on any
// platform), so nothing native is needed beyond triggering the request.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  if (!(await enforceRateLimit(`email-change:user:${ctx.userId}`, { max: 5, windowMs: 15 * 60 * 1000 }))) {
    return apiError("Too many attempts. Please try again in a few minutes.", 429);
  }

  const payload = await request.json().catch(() => null);
  const { currentPassword, newEmail } = changeEmailSchema.parse(payload ?? {});

  const passwordError = await requireCurrentPassword(ctx, currentPassword);
  if (passwordError) return apiError(passwordError.error, passwordError.status);

  if (!EMAIL_PATTERN.test(newEmail)) return apiError("Enter a valid email address.", 400);

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
  if (!user) return apiError("Not found.", 404);
  if (newEmail === user.email) return apiError("That's already your current email.", 400);

  const existing = await db.user.findUnique({ where: { email: newEmail } });
  if (existing) return apiError("An account with that email already exists.", 400);

  await db.pendingEmailChange.deleteMany({ where: { userId: ctx.userId } });

  const token = randomBytes(24).toString("hex");
  await db.pendingEmailChange.create({
    data: { userId: ctx.userId, newEmail, token, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) },
  });

  const sender = getEmailSender();
  const confirmUrl = `${getAppOrigin()}/verify-email-change?token=${token}`;
  await sender.send({ to: newEmail, subject: "Confirm your new 0dot.in email", html: renderEmailChangeEmailHtml(confirmUrl) });

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
