import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

const MAX_TRANSFER_COINS = 20;

// Mirrors actions/wallet.ts's transferCoinsAction exactly — same cap, same
// rate-limit key, same single-transaction debit+credit+ledger-row write
// (gated on coinBalance staying >= amount so two concurrent transfers
// can't overdraft the same balance).
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

  if (!handle) return apiError("A recipient username is required.", 400);
  if (!Number.isFinite(coinAmount) || coinAmount < 1 || coinAmount > MAX_TRANSFER_COINS) {
    return apiError(`Amount must be between 1 and ${MAX_TRANSFER_COINS} coins.`, 400);
  }
  if (!checkRateLimit(`wallet-transfer:${ctx.userId}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return apiError("You're sending coins too fast. Please slow down.", 429);
  }

  const recipientUsername = await db.username.findUnique({ where: { handle }, select: { userId: true } });
  if (!recipientUsername) return apiError("No user with that username.", 404);
  if (recipientUsername.userId === ctx.userId) return apiError("You can't send coins to yourself.", 400);

  let insufficientBalance = false;
  await db.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: ctx.userId, coinBalance: { gte: coinAmount } },
      data: { coinBalance: { decrement: coinAmount } },
    });
    if (debited.count === 0) {
      insufficientBalance = true;
      return;
    }
    await tx.user.update({ where: { id: recipientUsername.userId }, data: { coinBalance: { increment: coinAmount } } });
    await tx.coinTransfer.create({ data: { fromUserId: ctx.userId, toUserId: recipientUsername.userId, amount: coinAmount } });
  });

  if (insufficientBalance) {
    const current = await db.user.findUnique({ where: { id: ctx.userId }, select: { coinBalance: true } });
    return apiError(`You only have ${current?.coinBalance ?? 0} coins.`, 400);
  }

  revalidatePath("/wallet");

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
