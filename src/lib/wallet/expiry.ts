import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { postTransaction } from "@/lib/wallet/ledger";
import { SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { WALLET_LIMITS } from "@/lib/wallet/limits";

const GRANT_KINDS = [...WALLET_LIMITS.GRANT_KINDS];
const GRANT_KIND_SET = new Set<string>(GRANT_KINDS);

// addendum-coin-wallet-v2.md §8 — hourly sweep that claws unspent, expired
// grant value back to system_promo_issuance. Spent-down grants expire to
// zero (no clawback of already-used value). There is no per-grant lot
// tracking, so spending is attributed to the earliest-expiring grants
// first (the documented FIFO policy): the unspent remainder of expired
// grants is `max(0, expiredGrants - spent)`, minus what earlier runs
// already reclaimed. Only promo accounts that actually hold an expired
// grant are scanned (via the LedgerTransaction.expiresAt index). Both
// user_promo and business_promo are swept — a business promo grant with a
// TTL expires the same way (review finding #5).
export async function runPromoExpirySweepOnce() {
  const now = new Date();
  const hourBucket = now.toISOString().slice(0, 13); // yyyy-mm-ddThh

  const expiredGrantAccounts = await db.ledgerPosting.findMany({
    where: {
      amount: { gt: 0 },
      account: { is: { type: { in: ["user_promo", "business_promo"] } } },
      transaction: { is: { kind: { in: GRANT_KINDS }, expiresAt: { lt: now } } },
    },
    select: { accountId: true },
    distinct: ["accountId"],
  });
  const accountIds = expiredGrantAccounts.map((p) => p.accountId);

  const promoAccounts = accountIds.length
    ? await db.ledgerAccount.findMany({
        where: {
          id: { in: accountIds },
          cachedBalance: { gt: 0 },
          OR: [{ ownerUserId: { not: null } }, { ownerBusinessId: { not: null } }],
        },
        select: { id: true, ownerUserId: true, ownerBusinessId: true, cachedBalance: true },
      })
    : [];

  let sweptAccounts = 0;
  let sweptUnits = 0;

  for (const promo of promoAccounts) {
    const postings = await db.ledgerPosting.findMany({
      where: { accountId: promo.id },
      select: { amount: true, transaction: { select: { kind: true, expiresAt: true } } },
    });

    let grantedTotal = 0;
    let clawedTotal = 0;
    let expiredGross = 0;
    for (const p of postings) {
      const kind = p.transaction.kind;
      if (p.amount > 0 && GRANT_KIND_SET.has(kind)) {
        grantedTotal += p.amount;
        const exp = p.transaction.expiresAt;
        if (exp && exp.getTime() < now.getTime()) expiredGross += p.amount;
      } else if (p.amount < 0 && kind === "promo_expiry") {
        clawedTotal += -p.amount;
      }
    }

    const spent = Math.max(0, grantedTotal - clawedTotal - promo.cachedBalance);
    const toClawback = Math.max(
      0,
      Math.min(promo.cachedBalance, expiredGross - spent - clawedTotal),
    );
    if (toClawback <= 0) continue;

    try {
      const { created } = await db.$transaction((tx) =>
        postTransaction(tx, {
          kind: "promo_expiry",
          idempotencyKey: `promo_expiry:${promo.id}:${hourBucket}`,
          memo: "Expired unused grant coins",
          postings: [
            { accountId: promo.id, amount: -toClawback },
            { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: toClawback },
          ],
        }),
      );
      if (created) {
        sweptAccounts += 1;
        sweptUnits += toClawback;
      }
    } catch (err) {
      logger.error("promo-expiry: failed to sweep account", err, {
        accountId: promo.id,
        userId: promo.ownerUserId,
        businessId: promo.ownerBusinessId,
        toClawback,
      });
    }
  }

  const result = { promoAccountsScanned: promoAccounts.length, sweptAccounts, sweptUnits };
  logger.info("promo-expiry: swept", undefined, result);
  return result;
}
