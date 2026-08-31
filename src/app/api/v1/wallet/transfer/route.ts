import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { WALLET_LIMITS } from "@/lib/wallet/limits";
import { transferCoinsCore } from "@/lib/wallet/transfer";

const MAX_TRANSFER_COINS = WALLET_LIMITS.TRANSFER_MAX_COINS_PER_TX;

// Shares transferCoinsCore with actions/wallet.ts (addendum-coin-wallet-v2.md
// §5.2, §9) — same cap, same rate-limit key, same eligibility/velocity
// checks and single-transaction double-entry post, and the same rule that
// only the spendable bucket can fund a transfer. A body `idempotencyKey`
// is honored (a retry moves no additional coins and writes no second
// history row).
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const payload = await request.json().catch(() => null);
  const handle = typeof payload?.username === "string" ? payload.username.trim().toLowerCase() : "";
  const rawAmount = Number(payload?.coinAmount);
  const coinAmount = Math.round(rawAmount);
  const idempotencyKey =
    typeof payload?.idempotencyKey === "string" && payload.idempotencyKey.trim()
      ? `transfer:api:${payload.idempotencyKey.trim()}`
      : `transfer:api:${randomUUID()}`;

  if (!handle) return apiError("A recipient username is required.", 400);
  if (!Number.isFinite(coinAmount) || coinAmount < WALLET_LIMITS.TRANSFER_MIN_COINS || coinAmount > MAX_TRANSFER_COINS) {
    return apiError(`Amount must be between ${WALLET_LIMITS.TRANSFER_MIN_COINS} and ${MAX_TRANSFER_COINS} coins.`, 400);
  }
  if (!(await enforceRateLimit(`wallet-transfer:${ctx.userId}`, { max: 10, windowMs: 15 * 60 * 1000 }))) {
    return apiError("You're sending coins too fast. Please slow down.", 429);
  }

  const recipientUsername = await db.username.findUnique({ where: { handle }, select: { userId: true } });
  if (!recipientUsername) return apiError("No user with that username.", 404);
  if (recipientUsername.userId === ctx.userId) return apiError("You can't send coins to yourself.", 400);

  const result = await transferCoinsCore({
    fromUserId: ctx.userId,
    toUserId: recipientUsername.userId,
    coins: coinAmount,
    idempotencyKey,
  });
  if ("error" in result) return apiError(result.error, 400);

  revalidatePath("/wallet");

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
