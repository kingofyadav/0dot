import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { WALLET_LIMITS } from "@/lib/wallet/limits";
import { SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";

// addendum-coin-wallet-v2.md §11.4 — a daily scan that FLAGS suspicious coin
// activity to the ops channel (logger.warn → Sentry). It never blocks
// anything in v2; the reconciliation invariant (§11.1) and the per-admin
// caps (§11.3) are the hard controls.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runWalletAnomalyScanOnce() {
  const now = Date.now();
  const flags: string[] = [];

  // 1. Issuance spike — coins issued in the last 24h vs the trailing 7-day
  //    daily mean (days 1–8 back).
  const issuedUnits = async (since: Date, until: Date) => {
    const txns = await db.ledgerTransaction.findMany({
      where: { kind: { in: ["promo_grant", "signup_grant", "referral_reward", "admin_adjustment"] }, createdAt: { gte: since, lt: until } },
      select: { id: true },
    });
    if (txns.length === 0) return 0;
    const agg = await db.ledgerPosting.aggregate({
      _sum: { amount: true },
      where: { transactionId: { in: txns.map((t) => t.id) }, accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance },
    });
    return Math.abs(agg._sum.amount ?? 0);
  };
  const today = await issuedUnits(new Date(now - DAY_MS), new Date(now));
  const priorWeek = await issuedUnits(new Date(now - 8 * DAY_MS), new Date(now - DAY_MS));
  const weeklyMean = priorWeek / 7;
  if (today > 0 && weeklyMean > 0 && today > weeklyMean * 5) {
    flags.push(
      `issuance spike: ${(today / 100).toFixed(0)} coins issued in 24h vs a ${(weeklyMean / 100).toFixed(0)}/day trailing mean`,
    );
  }

  // 2. Sybil cash-out shape — one account receiving transfers from many
  //    accounts that are themselves young.
  const since = new Date(now - 7 * DAY_MS);
  const recentTransfers = await db.coinTransfer.findMany({
    where: { createdAt: { gte: since } },
    select: { fromUserId: true, toUserId: true },
  });
  const sendersByRecipient = new Map<string, Set<string>>();
  for (const t of recentTransfers) {
    if (!sendersByRecipient.has(t.toUserId)) sendersByRecipient.set(t.toUserId, new Set());
    sendersByRecipient.get(t.toUserId)!.add(t.fromUserId);
  }
  for (const [recipientId, senders] of sendersByRecipient) {
    if (senders.size < 10) continue;
    const youngSenders = await db.user.count({
      where: { id: { in: [...senders] }, createdAt: { gte: new Date(now - 14 * DAY_MS) } },
    });
    if (youngSenders >= 10) {
      flags.push(`sybil shape: account ${recipientId} received coins from ${senders.size} accounts (${youngSenders} <14d old) in 7d`);
    }
  }

  // 3. An admin near their daily issuance cap.
  const adminTxns = await db.ledgerTransaction.groupBy({
    by: ["actorUserId"],
    where: { kind: { in: ["promo_grant", "admin_adjustment"] }, actorUserId: { not: null }, createdAt: { gte: new Date(now - DAY_MS) } },
    _count: { _all: true },
  });
  for (const row of adminTxns) {
    if (!row.actorUserId) continue;
    const txns = await db.ledgerTransaction.findMany({
      where: { actorUserId: row.actorUserId, kind: { in: ["promo_grant", "admin_adjustment"] }, createdAt: { gte: new Date(now - DAY_MS) } },
      select: { id: true },
    });
    const agg = await db.ledgerPosting.aggregate({
      _sum: { amount: true },
      where: { transactionId: { in: txns.map((t) => t.id) }, accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance },
    });
    const coins = Math.abs(agg._sum.amount ?? 0) / WALLET_LIMITS.COIN_UNIT;
    if (coins >= WALLET_LIMITS.ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY * 0.8) {
      flags.push(`admin ${row.actorUserId} at ${coins} / ${WALLET_LIMITS.ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY} daily issuance cap`);
    }
  }

  if (flags.length > 0) {
    logger.warn("wallet-anomaly: flags raised", undefined, { flags });
  } else {
    logger.info("wallet-anomaly: clean", undefined, { checked: sendersByRecipient.size });
  }
  return { flags };
}
