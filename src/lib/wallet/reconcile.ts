import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";

const OWNER_ACCOUNT_TYPES = ["user_wallet", "user_promo", "business_wallet", "business_promo"];

// Read-only snapshot for the admin overview (§13.3) — no healing, no logs.
// `promoLiabilityUnits` is the outstanding promo/grant coin liability
// (system_promo_issuance runs negative; its magnitude is what's been
// issued and not yet clawed back). Uses cachedBalance (kept honest hourly
// by runWalletReconciliationOnce).
export async function getWalletOverview() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [byType, issuedToday, spentToday, ledgerTransactionCount] = await Promise.all([
    db.ledgerAccount.groupBy({ by: ["type"], _sum: { cachedBalance: true } }),
    db.ledgerTransaction.count({
      where: { kind: { in: ["signup_grant", "promo_grant", "referral_reward", "admin_adjustment"] }, createdAt: { gte: startOfDay } },
    }),
    db.ledgerTransaction.count({ where: { kind: "purchase", createdAt: { gte: startOfDay } } }),
    db.ledgerTransaction.count(),
  ]);

  const sum = (t: string) => byType.find((r) => r.type === t)?._sum.cachedBalance ?? 0;
  // Owner accounts are guaranteed non-negative (postTransaction's guard),
  // so the plain type-sum is the outstanding total.
  const outstandingUnits = byType
    .filter((r) => r.type.startsWith("user_") || r.type.startsWith("business_"))
    .reduce((s, r) => s + (r._sum.cachedBalance ?? 0), 0);

  return {
    outstandingCoins: outstandingUnits / 100,
    promoLiabilityCoins: Math.abs(sum("system_promo_issuance")) / 100,
    platformRevenueCoins: sum("system_platform_revenue") / 100,
    escrowCoins: sum("system_escrow") / 100,
    grantsToday: issuedToday,
    purchasesToday: spentToday,
    ledgerTransactionCount,
  };
}

// addendum-coin-wallet-v2.md §11.1 — the hourly correctness check. The
// global "every posting in the system sums to zero" assertion is the whole
// point of double-entry: any bug that creates or destroys coin value shows
// up here within the hour. Drift between cachedBalance and the posting sum
// is auto-healed; a non-zero global sum or an unbalanced transaction is
// logged at error (→ Sentry when a DSN is set) — page on it.
export async function runWalletReconciliationOnce() {
  const accountCount = await db.ledgerAccount.count();

  // Only MISMATCHED accounts come back to the app — one scan, minimal
  // transfer, no per-account round trips.
  const mismatched = await db.$queryRaw<
    Array<{ id: string; type: string; cachedBalance: number | bigint; computed: number | bigint }>
  >(Prisma.sql`
    SELECT a."id", a."type", a."cachedBalance",
           COALESCE((SELECT SUM(p."amount") FROM "LedgerPosting" p WHERE p."accountId" = a."id"), 0) AS "computed"
    FROM "LedgerAccount" a
    WHERE a."cachedBalance" <> COALESCE((SELECT SUM(p."amount") FROM "LedgerPosting" p WHERE p."accountId" = a."id"), 0)
       OR (a."type" IN ('user_wallet','user_promo','business_wallet','business_promo')
           AND COALESCE((SELECT SUM(p."amount") FROM "LedgerPosting" p WHERE p."accountId" = a."id"), 0) < 0)
  `);

  let drift = 0;
  let negativeOwnerAccounts = 0;
  for (const row of mismatched) {
    const cached = Number(row.cachedBalance);
    const computed = Number(row.computed);
    if (cached !== computed) {
      drift += 1;
      logger.error("wallet-reconcile: cachedBalance drift — healing", undefined, {
        accountId: row.id,
        type: row.type,
        cached,
        computed,
      });
      await db.ledgerAccount.update({ where: { id: row.id }, data: { cachedBalance: computed } });
    }
    if (OWNER_ACCOUNT_TYPES.includes(row.type) && computed < 0) {
      negativeOwnerAccounts += 1;
      logger.error("wallet-reconcile: owner account is negative", undefined, {
        accountId: row.id,
        type: row.type,
        computed,
      });
    }
  }

  const globalAgg = await db.ledgerPosting.aggregate({ _sum: { amount: true } });
  const globalSum = globalAgg._sum.amount ?? 0;
  if (globalSum !== 0) {
    logger.error("wallet-reconcile: GLOBAL POSTING SUM IS NOT ZERO — coin value created or destroyed", undefined, {
      globalSum,
    });
  }

  // Postings are immutable (onDelete: Restrict), so a transaction that was
  // balanced can't later unbalance — check only the recent window, and let
  // the query return just the bad rows.
  const recentWindow = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const unbalanced = await db.$queryRaw<Array<{ transactionId: string }>>(Prisma.sql`
    SELECT p."transactionId"
    FROM "LedgerPosting" p
    WHERE p."createdAt" >= ${recentWindow}
    GROUP BY p."transactionId"
    HAVING SUM(p."amount") <> 0
  `);
  if (unbalanced.length > 0) {
    logger.error("wallet-reconcile: unbalanced transaction(s)", undefined, {
      count: unbalanced.length,
      ids: unbalanced.slice(0, 20).map((t) => t.transactionId),
    });
  }

  const systemSums = await db.ledgerPosting.groupBy({
    by: ["accountId"],
    _sum: { amount: true },
    where: { accountId: { in: Object.values(SYSTEM_ACCOUNT_IDS) } },
  });
  const systemUnits = (id: string) => systemSums.find((s) => s.accountId === id)?._sum.amount ?? 0;

  const result = {
    accountsChecked: accountCount,
    drift,
    negativeOwnerAccounts,
    globalSum,
    unbalancedTransactions: unbalanced.length,
    promoIssuanceUnits: systemUnits(SYSTEM_ACCOUNT_IDS.system_promo_issuance),
    platformRevenueUnits: systemUnits(SYSTEM_ACCOUNT_IDS.system_platform_revenue),
    healthy:
      drift === 0 && negativeOwnerAccounts === 0 && globalSum === 0 && unbalanced.length === 0,
  };

  if (result.healthy) {
    logger.info("wallet-reconcile: healthy", undefined, result);
  } else {
    logger.error("wallet-reconcile: UNHEALTHY", undefined, result);
  }
  return result;
}
