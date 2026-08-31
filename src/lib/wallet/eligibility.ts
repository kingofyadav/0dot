import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { WALLET_LIMITS } from "@/lib/wallet/limits";

// addendum-coin-wallet-v2.md §5.2 / §11.2 — the pre-flight checks a coin
// transfer must pass, shared by the web action and the API route so they
// can't drift (#9, #10). Returns null when OK, or a friendly error string.

export async function checkTransferEligibility(
  fromUserId: string,
  toUserId: string,
): Promise<string | null> {
  const [sender, recipient, block] = await Promise.all([
    db.user.findUnique({ where: { id: fromUserId }, select: { emailVerifiedAt: true, createdAt: true } }),
    db.user.findUnique({
      where: { id: toUserId },
      select: { status: true, deletionScheduledFor: true },
    }),
    db.block.findFirst({
      where: {
        OR: [
          { blockerId: fromUserId, blockedId: toUserId },
          { blockerId: toUserId, blockedId: fromUserId },
        ],
      },
      select: { blockerId: true },
    }),
  ]);

  if (!sender?.emailVerifiedAt) return "Verify your email before sending coins.";
  const ageHours = (Date.now() - sender.createdAt.getTime()) / (60 * 60 * 1000);
  if (ageHours < WALLET_LIMITS.TRANSFER_MIN_ACCOUNT_AGE_HOURS) {
    return "New accounts can't send coins yet — try again once your account is a day old.";
  }
  if (!recipient || recipient.status !== "active" || recipient.deletionScheduledFor) {
    return "That account is no longer available.";
  }
  if (block) return "You can't send coins to this account.";
  return null;
}

// Per-day caps on coins sent and distinct recipients, read straight off
// CoinTransfer (indexed on [fromUserId, createdAt]). `coins` is this
// pending transfer's amount. Takes a transaction client so the read and the
// CoinTransfer insert that follows it happen under the same write lock —
// two concurrent transfers can't both pass the daily cap and then both
// commit (review finding #6).
export async function checkTransferVelocity(
  client: Prisma.TransactionClient,
  fromUserId: string,
  toUserId: string,
  coins: number,
): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await client.coinTransfer.findMany({
    where: { fromUserId, createdAt: { gte: since } },
    select: { amount: true, toUserId: true },
  });

  const coinsToday = recent.reduce((s, t) => s + t.amount, 0);
  if (coinsToday + coins > WALLET_LIMITS.TRANSFER_MAX_COINS_PER_DAY) {
    return `That would pass the ${WALLET_LIMITS.TRANSFER_MAX_COINS_PER_DAY}-coin daily send limit.`;
  }

  const recipientsToday = new Set(recent.map((t) => t.toUserId));
  if (!recipientsToday.has(toUserId) && recipientsToday.size >= WALLET_LIMITS.TRANSFER_MAX_RECIPIENTS_PER_DAY) {
    return `You've already sent coins to ${WALLET_LIMITS.TRANSFER_MAX_RECIPIENTS_PER_DAY} people today.`;
  }
  return null;
}
