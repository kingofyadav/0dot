import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { purchaseProfilePremiumWithCoins } from "@/lib/platform-billing";
import { settleCoinPurchase } from "@/lib/wallet/charge";
import { createTipRow } from "@/app/actions/tips";
import { notifyTipReceived } from "@/lib/notifications";

// addendum-coin-wallet-v2.md §13.4 — pay for a feature with coins from the
// API, wrapping the same cores the web actions use (closes the auth-shape
// gap, #9). body: { target: "premium" | "tip", ...params, idempotencyKey }.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  if (!(await enforceRateLimit(`wallet-purchase:${ctx.userId}`, { max: 15, windowMs: 15 * 60 * 1000 }))) {
    return apiError("You're purchasing too fast. Please slow down.", 429);
  }

  const body = await request.json().catch(() => null);
  const target = typeof body?.target === "string" ? body.target : "";
  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : randomUUID();
  const headers = { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) };

  if (target === "premium") {
    const billingInterval = body?.billingInterval === "yearly" ? "yearly" : "monthly";
    const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { id: true } });
    if (!profile) return apiError("Claim a username before buying Premium.", 400);
    const result = await purchaseProfilePremiumWithCoins(ctx.userId, profile.id, billingInterval, idempotencyKey);
    if (result.error) return apiError(result.error, 400);
    revalidatePath("/wallet");
    return Response.json({ ok: true, target: "premium" }, { headers });
  }

  if (target === "tip") {
    const handle = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const amount = Math.round(Number(body?.amount) * 100) / 100;
    const message = typeof body?.message === "string" ? body.message.slice(0, 280) : "";
    if (!handle) return apiError("A recipient username is required.", 400);
    if (!Number.isFinite(amount) || amount < 1 || amount > 500) return apiError("Tip must be between $1 and $500.", 400);

    const recipient = await db.username.findUnique({ where: { handle }, select: { userId: true } });
    if (!recipient) return apiError("Creator not found.", 404);
    if (recipient.userId === ctx.userId) return apiError("You can't tip yourself.", 400);

    const result = await settleCoinPurchase({
      kind: "tip",
      payerId: ctx.userId,
      payeeUserId: recipient.userId,
      amountUsd: amount,
      currency: "usd",
      relatedObjectType: "tip",
      idempotencyKey: `tip:coin:api:${idempotencyKey}`,
      metadata: { message },
      createRows: createTipRow,
    });
    if ("error" in result) return apiError(result.error, 400);
    if (!result.alreadySettled) {
      await notifyTipReceived({ recipientId: recipient.userId, actorId: ctx.userId });
    }
    return Response.json({ ok: true, target: "tip" }, { headers });
  }

  return apiError(`Unsupported purchase target "${target}".`, 400);
}
