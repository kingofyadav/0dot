import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { WALLET_LIMITS } from "@/lib/wallet/limits";
import { transferCoinsCore } from "@/lib/wallet/transfer";

const MAX_TRANSFER_COINS = WALLET_LIMITS.TRANSFER_MAX_COINS_PER_TX;

// Reference template for zod-based body validation on API routes (see also
// v1/account/password, v1/account/two-factor/disable, and
// v1/account/contact/email for the same pattern) — replaces this route's
// previous hand-rolled `typeof x === "string"` / `Number(x)` checks. New
// routes with a JSON body should follow this shape rather than hand-rolled
// typeof/Number() casts. Field order matters: zod collects issues in
// declaration order, and only the first is surfaced below, so username
// is checked before coinAmount to match the old code's check order.
const transferBodySchema = z.object({
  // Falls back to "" for a missing/non-string field (matching the old
  // `typeof payload?.username === "string" ? ... : ""` ternary) so that
  // case fails the min(1) check below with this route's own message,
  // rather than zod's generic "Required"/"Invalid type" one.
  username: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    z.string().min(1, "A recipient username is required.")
  ),
  // Number(v) mirrors the old `Number(payload?.coinAmount)` — lenient on
  // numeric strings, NaN for anything else — then rounds before
  // range-checking, same as the old `Math.round(rawAmount)`.
  coinAmount: z.preprocess(
    (v) => Math.round(Number(v)),
    z
      .number()
      .refine(
        (n) => Number.isFinite(n) && n >= WALLET_LIMITS.TRANSFER_MIN_COINS && n <= MAX_TRANSFER_COINS,
        `Amount must be between ${WALLET_LIMITS.TRANSFER_MIN_COINS} and ${MAX_TRANSFER_COINS} coins.`
      )
  ),
  idempotencyKey: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().optional()
  ),
});

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
  const parsed = transferBodySchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid request body.", 400);
  }
  const { username: handle, coinAmount } = parsed.data;
  const idempotencyKey = parsed.data.idempotencyKey
    ? `transfer:api:${parsed.data.idempotencyKey}`
    : `transfer:api:${randomUUID()}`;

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
