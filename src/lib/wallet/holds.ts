import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { postTransaction, type PostingInput } from "@/lib/wallet/ledger";
import { ensureUserAccounts, ensureBusinessAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { coinsToUnits } from "@/lib/wallet/limits";
import type { FeatureSettlement } from "@/lib/wallet/charge";

// addendum-coin-wallet-v2.md §9 — coin escrow for anything that isn't
// "pay now, done now": the payer's coins move into system_escrow on
// placeHold and only reach the payee (captureHold) or return to the payer
// (releaseHold) once the async step resolves. The promo/spendable split is
// recorded on the hold transaction so a release restores the exact buckets
// (promo coins can't be laundered into spendable via a hold round-trip).
// All three take the caller's transaction client; runHoldExpirySweepOnce
// wraps its own.

type HoldMeta = { fromPromo: number; fromWallet: number; expiresAt: string };

export async function placeHold(
  tx: Prisma.TransactionClient,
  params: {
    payerId: string;
    amountUsd: number;
    relatedObjectType: string;
    relatedObjectId: string;
    expiresAt: Date;
    idempotencyKey: string;
  },
): Promise<{ holdId: string; ledgerTransactionId: string }> {
  const units = coinsToUnits(params.amountUsd);
  const payer = await ensureUserAccounts(tx, params.payerId);
  const promo = await tx.ledgerAccount.findUniqueOrThrow({
    where: { id: payer.promoId },
    select: { cachedBalance: true },
  });
  const fromPromo = Math.min(Math.max(promo.cachedBalance, 0), units);
  const fromWallet = units - fromPromo;

  const postings: PostingInput[] = [{ accountId: SYSTEM_ACCOUNT_IDS.system_escrow, amount: units }];
  if (fromPromo > 0) postings.push({ accountId: payer.promoId, amount: -fromPromo });
  if (fromWallet > 0) postings.push({ accountId: payer.walletId, amount: -fromWallet });

  const meta: HoldMeta = { fromPromo, fromWallet, expiresAt: params.expiresAt.toISOString() };
  const { transaction: ledgerTxn } = await postTransaction(tx, {
    kind: "hold",
    idempotencyKey: params.idempotencyKey,
    actorUserId: params.payerId,
    relatedObjectType: params.relatedObjectType,
    relatedObjectId: params.relatedObjectId,
    metadata: meta,
    postings,
  });

  const existingHold = await tx.ledgerHold.findUnique({ where: { transactionId: ledgerTxn.id } });
  const hold =
    existingHold ??
    (await tx.ledgerHold.create({
      data: {
        transactionId: ledgerTxn.id,
        state: "pending",
        expiresAt: params.expiresAt,
        relatedObjectType: params.relatedObjectType,
        relatedObjectId: params.relatedObjectId,
      },
    }));

  return { holdId: hold.id, ledgerTransactionId: ledgerTxn.id };
}

async function loadPendingHold(tx: Prisma.TransactionClient, holdId: string) {
  const hold = await tx.ledgerHold.findUnique({
    where: { id: holdId },
    include: { transaction: true },
  });
  if (!hold) throw new Error(`hold ${holdId} not found`);
  const escrowPosting = await tx.ledgerPosting.findFirst({
    where: { transactionId: hold.transactionId, accountId: SYSTEM_ACCOUNT_IDS.system_escrow },
  });
  const units = escrowPosting?.amount ?? 0;
  const meta = JSON.parse(hold.transaction.metadataJson || "{}") as Partial<HoldMeta>;
  const payerId = hold.transaction.actorUserId!;
  return { hold, units, meta, payerId };
}

// Escrow → payee wallet (+ platform fee), and run the feature's own
// row-creation via the same FeatureSettlement contract the webhook /
// chargeWallet use. Idempotent: a captured/released hold is a no-op.
export async function captureHold(
  tx: Prisma.TransactionClient,
  holdId: string,
  params: {
    payeeUserId?: string | null;
    payeeBusinessId?: string | null;
    kind: string; // PaymentTransaction kind
    currency: string;
    relatedObjectType?: string;
    relatedObjectId?: string;
    metadata: Record<string, string>;
    createRows: (tx: Prisma.TransactionClient, s: FeatureSettlement) => Promise<void>;
  },
): Promise<{ paymentTransactionId: string; alreadySettled: boolean }> {
  const { hold, units, payerId } = await loadPendingHold(tx, holdId);
  if (hold.state === "captured") {
    const linked = await tx.ledgerTransaction.findFirst({
      where: { kind: "hold_capture", relatedObjectId: hold.id },
      select: { paymentTransactionId: true },
    });
    return { paymentTransactionId: linked?.paymentTransactionId ?? "", alreadySettled: true };
  }
  if (hold.state !== "pending") throw new Error(`hold ${holdId} is ${hold.state}, cannot capture`);

  const hasExternalPayee = Boolean(params.payeeUserId || params.payeeBusinessId);
  const feeRate = await resolveFeeRate(tx, params.payeeUserId ?? null);
  const amountUsd = units / coinsToUnits(1);
  const platformFeeUsd = hasExternalPayee ? Math.round(amountUsd * feeRate * 100) / 100 : amountUsd;
  const feeUnits = Math.round(platformFeeUsd * 100);
  const payeeUnits = units - feeUnits;

  const postings: PostingInput[] = [{ accountId: SYSTEM_ACCOUNT_IDS.system_escrow, amount: -units }];
  if (feeUnits > 0) postings.push({ accountId: SYSTEM_ACCOUNT_IDS.system_platform_revenue, amount: feeUnits });
  if (payeeUnits > 0) {
    if (params.payeeUserId) {
      const payee = await ensureUserAccounts(tx, params.payeeUserId);
      postings.push({ accountId: payee.walletId, amount: payeeUnits });
    } else if (params.payeeBusinessId) {
      const payee = await ensureBusinessAccounts(tx, params.payeeBusinessId);
      postings.push({ accountId: payee.walletId, amount: payeeUnits });
    } else {
      postings.push({ accountId: SYSTEM_ACCOUNT_IDS.system_platform_revenue, amount: payeeUnits });
    }
  }

  const { transaction: captureTxn } = await postTransaction(tx, {
    kind: "hold_capture",
    idempotencyKey: `hold_capture:${hold.id}`,
    actorUserId: payerId,
    relatedObjectType: "ledger_hold",
    relatedObjectId: hold.id,
    postings,
  });
  await tx.ledgerHold.update({ where: { id: hold.id }, data: { state: "captured" } });

  const pt = await recordPaymentTransaction(tx, {
    kind: params.kind,
    payerId,
    payeeId: params.payeeUserId ?? null,
    payeeBusinessId: params.payeeBusinessId ?? null,
    amount: amountUsd,
    currency: params.currency,
    processor: "wallet",
    processorReference: captureTxn.id,
    status: "succeeded",
    relatedObjectType: params.relatedObjectType,
    relatedObjectId: params.relatedObjectId,
  });
  await tx.ledgerTransaction.update({ where: { id: captureTxn.id }, data: { paymentTransactionId: pt.id } });

  await params.createRows(tx, {
    paymentTransactionId: pt.id,
    payerId,
    payeeId: params.payeeUserId ?? null,
    amount: amountUsd,
    currency: params.currency,
    metadata: params.metadata,
  });

  return { paymentTransactionId: pt.id, alreadySettled: false };
}

// Escrow → back to the payer, into the exact promo/spendable buckets the
// hold pulled from. Idempotent.
export async function releaseHold(tx: Prisma.TransactionClient, holdId: string): Promise<void> {
  const { hold, units, meta, payerId } = await loadPendingHold(tx, holdId);
  if (hold.state !== "pending") return;

  const payer = await ensureUserAccounts(tx, payerId);
  const fromPromo = Math.min(meta.fromPromo ?? 0, units);
  const fromWallet = units - fromPromo;
  const postings: PostingInput[] = [{ accountId: SYSTEM_ACCOUNT_IDS.system_escrow, amount: -units }];
  if (fromPromo > 0) postings.push({ accountId: payer.promoId, amount: fromPromo });
  if (fromWallet > 0) postings.push({ accountId: payer.walletId, amount: fromWallet });

  await postTransaction(tx, {
    kind: "hold_release",
    idempotencyKey: `hold_release:${hold.id}`,
    actorUserId: payerId,
    relatedObjectType: "ledger_hold",
    relatedObjectId: hold.id,
    postings,
  });
  await tx.ledgerHold.update({ where: { id: hold.id }, data: { state: "released" } });
}

// addendum-coin-wallet-v2.md §9 — releases holds still pending past their
// expiry (an abandoned freelance request, an unconfirmed checkout).
export async function runHoldExpirySweepOnce() {
  const expired = await db.ledgerHold.findMany({
    where: { state: "pending", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 500,
  });
  let released = 0;
  for (const { id } of expired) {
    try {
      await db.$transaction((tx) => releaseHold(tx, id));
      released += 1;
    } catch (err) {
      logger.error("hold-expiry: failed to release hold", err, { holdId: id });
    }
  }
  const result = { expiredFound: expired.length, released };
  logger.info("hold-expiry: swept", undefined, result);
  return result;
}
