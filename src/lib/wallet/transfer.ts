import "server-only";
import { db } from "@/lib/db";
import { postTransaction, getWalletBalance, WalletError } from "@/lib/wallet/ledger";
import { ensureUserAccounts } from "@/lib/wallet/accounts";
import { coinsToUnits } from "@/lib/wallet/limits";
import { notifyCoinsReceived } from "@/lib/notifications";
import { checkTransferEligibility, checkTransferVelocity } from "@/lib/wallet/eligibility";

// addendum-coin-wallet-v2.md §5.2 — the shared core behind both
// actions/wallet.ts and /api/v1/wallet/transfer (fixes the auth-shape
// inconsistency, #9). Recipient resolution and rate limiting stay in the
// callers; this owns the money movement.
//
// The transfer debits the SPENDABLE (user_wallet) bucket only — user_promo
// is never a transfer source (§8, fixes #16).
export async function transferCoinsCore(params: {
  fromUserId: string;
  toUserId: string;
  coins: number;
  idempotencyKey: string;
}): Promise<{ ok: true } | { error: string }> {
  const units = coinsToUnits(params.coins);

  const eligibilityError = await checkTransferEligibility(params.fromUserId, params.toUserId);
  if (eligibilityError) return { error: eligibilityError };

  let outcome: "created" | "replayed" | { error: string };
  try {
    outcome = await db.$transaction(async (tx) => {
      // Velocity is checked INSIDE the transaction (same write lock as the
      // CoinTransfer insert below) so concurrent transfers can't jointly
      // exceed the daily coin / recipient caps.
      const velocityError = await checkTransferVelocity(tx, params.fromUserId, params.toUserId, params.coins);
      if (velocityError) return { error: velocityError };

      const from = await ensureUserAccounts(tx, params.fromUserId);
      const to = await ensureUserAccounts(tx, params.toUserId);

      const result = await postTransaction(tx, {
        kind: "transfer",
        idempotencyKey: params.idempotencyKey,
        actorUserId: params.fromUserId,
        relatedObjectType: "user",
        relatedObjectId: params.toUserId,
        postings: [
          { accountId: from.walletId, amount: -units },
          { accountId: to.walletId, amount: units },
        ],
      });

      // Replay of the same idempotencyKey — the coins already moved on the
      // first call. Don't write a second CoinTransfer row (it would show
      // twice in history and double-count toward the velocity limit) or
      // re-notify.
      if (!result.created) return "replayed";

      await tx.coinTransfer.create({
        data: { fromUserId: params.fromUserId, toUserId: params.toUserId, amount: params.coins },
      });
      return "created";
    });
  } catch (err) {
    if (err instanceof WalletError && err.code === "INSUFFICIENT_FUNDS") {
      const { spendable } = await getWalletBalance(params.fromUserId);
      return {
        error:
          spendable > 0
            ? `You can only send ${spendable} spendable coin${spendable === 1 ? "" : "s"}.`
            : "You have no spendable coins. Coins from the signup bonus and other grants can't be transferred.",
      };
    }
    throw err;
  }

  if (typeof outcome === "object") return outcome; // velocity error
  if (outcome === "created") {
    await notifyCoinsReceived({ recipientId: params.toUserId, actorId: params.fromUserId });
  }
  return { ok: true };
}
