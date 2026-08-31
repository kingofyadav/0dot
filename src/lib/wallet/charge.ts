import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { postTransaction, WalletError, type PostingInput } from "@/lib/wallet/ledger";
import { ensureUserAccounts, ensureBusinessAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { coinsToUnits } from "@/lib/wallet/limits";
import { notifyCoinsReceived } from "@/lib/notifications";

// addendum-coin-wallet-v2.md §6.1 — the bridge from the coin ledger to
// PaymentTransaction. A coin sale writes the same money-movement row a
// Stripe sale does (so analytics + admin views are rail-agnostic) with
// processor "wallet" and processorReference pointing at the backing
// LedgerTransaction. 1 coin = $1, so a USD price maps straight to coin
// units at ×100 (cents precision, §4.1). Must run inside the caller's
// db.$transaction.
export async function chargeWallet(
  tx: Prisma.TransactionClient,
  params: {
    payerId: string;
    payeeUserId?: string | null;
    payeeBusinessId?: string | null; // §6.5 — Store sales, business-hosted tickets
    amountUsd: number;
    currency: string;
    kind: string; // PaymentTransaction kind (tip | donation | digital_purchase | ...)
    relatedObjectType?: string;
    relatedObjectId?: string;
    idempotencyKey: string;
  },
): Promise<{ paymentTransactionId: string; ledgerTransactionId: string; alreadySettled: boolean }> {
  const amountUnits = coinsToUnits(params.amountUsd);
  if (amountUnits <= 0) throw new WalletError("BAD_REQUEST", "charge amount must be positive");
  if (params.payeeUserId && params.payeeBusinessId) {
    throw new WalletError("BAD_REQUEST", "a charge has at most one payee");
  }

  // Fee: same rule recordPaymentTransaction applies — a percentage of the
  // sale for an external payee (premium creators keep their reduced rate),
  // the whole amount when 0dot is the payee.
  const hasExternalPayee = Boolean(params.payeeUserId || params.payeeBusinessId);
  const feeRate = await resolveFeeRate(tx, params.payeeUserId ?? null);
  const platformFeeUsd = hasExternalPayee
    ? Math.round(params.amountUsd * feeRate * 100) / 100
    : params.amountUsd;
  const feeUnits = Math.round(platformFeeUsd * 100);
  const payeeUnits = amountUnits - feeUnits; // remainder to the payee, exact (§4.1)

  const payer = await ensureUserAccounts(tx, params.payerId);
  const promo = await tx.ledgerAccount.findUniqueOrThrow({
    where: { id: payer.promoId },
    select: { cachedBalance: true },
  });
  const fromPromo = Math.min(Math.max(promo.cachedBalance, 0), amountUnits);
  const fromWallet = amountUnits - fromPromo;

  const postings: PostingInput[] = [];
  if (fromPromo > 0) postings.push({ accountId: payer.promoId, amount: -fromPromo });
  if (fromWallet > 0) postings.push({ accountId: payer.walletId, amount: -fromWallet });
  if (feeUnits > 0) postings.push({ accountId: SYSTEM_ACCOUNT_IDS.system_platform_revenue, amount: feeUnits });

  if (payeeUnits > 0) {
    if (params.payeeUserId) {
      const payee = await ensureUserAccounts(tx, params.payeeUserId);
      postings.push({ accountId: payee.walletId, amount: payeeUnits });
    } else if (params.payeeBusinessId) {
      const payee = await ensureBusinessAccounts(tx, params.payeeBusinessId);
      postings.push({ accountId: payee.walletId, amount: payeeUnits });
    } else {
      // 0dot is the payee — any rounding remainder is still platform revenue.
      postings.push({ accountId: SYSTEM_ACCOUNT_IDS.system_platform_revenue, amount: payeeUnits });
    }
  }

  const { transaction: ledgerTxn, created } = await postTransaction(tx, {
    kind: "purchase",
    idempotencyKey: params.idempotencyKey,
    actorUserId: params.payerId,
    relatedObjectType: params.relatedObjectType ?? null,
    relatedObjectId: params.relatedObjectId ?? null,
    postings,
  });

  // Idempotency hit — a prior call already recorded the PaymentTransaction.
  if (!created) {
    return {
      paymentTransactionId: ledgerTxn.paymentTransactionId ?? "",
      ledgerTransactionId: ledgerTxn.id,
      alreadySettled: true,
    };
  }

  const pt = await recordPaymentTransaction(tx, {
    kind: params.kind,
    payerId: params.payerId,
    payeeId: params.payeeUserId ?? null,
    payeeBusinessId: params.payeeBusinessId ?? null,
    amount: params.amountUsd,
    currency: params.currency,
    processor: "wallet",
    processorReference: ledgerTxn.id,
    status: "succeeded",
    relatedObjectType: params.relatedObjectType,
    relatedObjectId: params.relatedObjectId,
  });
  await tx.ledgerTransaction.update({
    where: { id: ledgerTxn.id },
    data: { paymentTransactionId: pt.id },
  });

  return { paymentTransactionId: pt.id, ledgerTransactionId: ledgerTxn.id, alreadySettled: false };
}

// The object a feature's row-creation needs, whichever rail settled the
// payment (addendum-coin-wallet-v2.md §6.2). The PaymentTransaction is
// created by the caller (webhook or chargeWallet) before createRows runs.
export type FeatureSettlement = {
  paymentTransactionId: string;
  payerId: string;
  payeeId: string | null;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
};

// The coin counterpart of a Stripe-webhook activateXxx: charge the payer's
// wallet, record the PaymentTransaction, and run the feature's own row
// creation — all in one transaction, so a coin tip lands its Tip row and
// its LedgerTransaction together or not at all (§6.2's acceptance
// criterion). Feature-specific notifications/revalidation stay with the
// caller, mirroring the webhook path.
export async function settleCoinPurchase(params: {
  kind: string;
  payerId: string;
  payeeUserId?: string | null;
  payeeBusinessId?: string | null;
  amountUsd: number;
  currency: string;
  relatedObjectType?: string;
  relatedObjectId?: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  createRows: (tx: Prisma.TransactionClient, settlement: FeatureSettlement) => Promise<void>;
}): Promise<{ ok: true; alreadySettled: boolean; paymentTransactionId: string } | { error: string }> {
  try {
    const outcome = await db.$transaction(async (tx) => {
      const charge = await chargeWallet(tx, {
        payerId: params.payerId,
        payeeUserId: params.payeeUserId ?? null,
        payeeBusinessId: params.payeeBusinessId ?? null,
        amountUsd: params.amountUsd,
        currency: params.currency,
        kind: params.kind,
        relatedObjectType: params.relatedObjectType,
        relatedObjectId: params.relatedObjectId,
        idempotencyKey: params.idempotencyKey,
      });
      if (charge.alreadySettled) {
        return { alreadySettled: true, paymentTransactionId: charge.paymentTransactionId };
      }
      await params.createRows(tx, {
        paymentTransactionId: charge.paymentTransactionId,
        payerId: params.payerId,
        payeeId: params.payeeUserId ?? null,
        amount: params.amountUsd,
        currency: params.currency,
        metadata: params.metadata,
      });
      return { alreadySettled: false, paymentTransactionId: charge.paymentTransactionId };
    });
    return { ok: true, ...outcome };
  } catch (err) {
    if (err instanceof WalletError && err.code === "INSUFFICIENT_FUNDS") {
      return { error: "You don't have enough coins for this purchase." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Concurrent double-purchase — the whole transaction, charge included,
      // rolled back, so the buyer keeps their coins.
      return { error: "You already have this." };
    }
    throw err;
  }
}

// addendum-coin-wallet-v2.md §7.3 — settle a refund as coins: credit the
// original payer's spendable wallet from system_refund_source, and flip the
// source PaymentTransaction to "refunded" on a full refund. The
// LedgerTransaction(kind:"refund"), linked to the source PT, is the
// money-movement record — no bogus second PaymentTransaction (a refund
// doesn't fit the facilitator fee model). Idempotent on the source payment;
// a replay is a no-op success. A caller (refund policy / admin tool) is
// still pending the §18 #4 product decision.
export async function refundToWallet(params: {
  paymentTransactionId: string;
  amountUsd: number;
  reason: string;
  actorUserId?: string | null;
}): Promise<{ ok: true; alreadyRefunded: boolean } | { error: string }> {
  const pt = await db.paymentTransaction.findUnique({ where: { id: params.paymentTransactionId } });
  if (!pt) return { error: "Unknown payment transaction." };
  if (!pt.payerId) return { error: "That payment has no payer to refund." };
  if (pt.status === "refunded") return { ok: true, alreadyRefunded: true };
  const amountCents = Math.round(params.amountUsd * 100);
  const sourceCents = Math.round(pt.amount * 100);
  if (amountCents <= 0 || amountCents > sourceCents) return { error: "Invalid refund amount." };
  const units = coinsToUnits(params.amountUsd);
  const isFullRefund = amountCents === sourceCents;

  const payerId = pt.payerId;
  const { created } = await db.$transaction(async (tx) => {
    const { walletId } = await ensureUserAccounts(tx, payerId);
    const result = await postTransaction(tx, {
      kind: "refund",
      idempotencyKey: `refund:${params.paymentTransactionId}`,
      actorUserId: params.actorUserId ?? null,
      memo: params.reason,
      relatedObjectType: pt.relatedObjectType ?? null,
      relatedObjectId: pt.relatedObjectId ?? null,
      paymentTransactionId: pt.id,
      postings: [
        { accountId: SYSTEM_ACCOUNT_IDS.system_refund_source, amount: -units },
        { accountId: walletId, amount: units },
      ],
    });
    if (result.created && isFullRefund) {
      await tx.paymentTransaction.update({ where: { id: pt.id }, data: { status: "refunded" } });
    }
    return result;
  });

  if (!created) return { ok: true, alreadyRefunded: true };

  if (params.actorUserId) {
    await notifyCoinsReceived({ recipientId: payerId, actorId: params.actorUserId });
  }
  return { ok: true, alreadyRefunded: false };
}
