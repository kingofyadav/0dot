"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor, recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { settleCoinPurchase, type FeatureSettlement } from "@/lib/wallet/charge";
import { coinActionKey } from "@/lib/wallet/limits";
import { getAppOrigin } from "@/lib/email";
import { notifyTipReceived } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MIN_TIP_AMOUNT = 1;
const MAX_TIP_AMOUNT = 500; // sane per-tip ceiling — not a spec requirement, just abuse-resistance
const MAX_MESSAGE_LENGTH = 280;

function checkTipRateLimit(userId: string): boolean {
  return checkRateLimit(`tip:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// spec §6.1/§6.2: the smallest feature exercising the payments backbone
// end-to-end. A Tip row is only ever created alongside its
// PaymentTransaction — now from activateTip below, called by the Stripe
// webhook once checkout.session.completed confirms payment, never from
// this action directly (a hosted Checkout redirect can't confirm payment
// synchronously). No "record the tip, charge later" path that could drift
// out of sync (§6.2's literal acceptance criterion) — activateTip is the
// only place a Tip row is ever created, and only once Stripe confirms.
export async function sendTip(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const creatorHandle = String(formData.get("creatorHandle") ?? "").trim().toLowerCase();
  const message = String(formData.get("message") ?? "").trim();

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  }

  const rawAmount = Number(formData.get("amount"));
  // Two-decimal (cents) precision only — rejects e.g. 5.005, not just
  // negative/NaN.
  const amount = Math.round(rawAmount * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_TIP_AMOUNT || amount > MAX_TIP_AMOUNT) {
    return { error: `Tip amount must be between $${MIN_TIP_AMOUNT} and $${MAX_TIP_AMOUNT}.` };
  }

  const creatorUsername = await db.username.findUnique({
    where: { handle: creatorHandle },
    select: { userId: true },
  });
  if (!creatorUsername) return { error: "Creator not found." };
  if (creatorUsername.userId === user.id) return { error: "You can't tip yourself." };

  if (!checkTipRateLimit(user.id)) {
    return { error: "You're sending tips too fast. Please slow down." };
  }

  // addendum-coin-wallet-v2.md §6.3/§6.4: coins settle synchronously and
  // need no payout account on the payee (the coins just land in their
  // wallet). Same activateTip row-creation the Stripe webhook uses.
  if (String(formData.get("payWith") ?? "card") === "coins") {
    const result = await settleCoinPurchase({
      kind: "tip",
      payerId: user.id,
      payeeUserId: creatorUsername.userId,
      amountUsd: amount,
      currency: "usd",
      relatedObjectType: "tip",
      idempotencyKey: coinActionKey("tip:coin", formData.get("idempotencyKey"), user.id, creatorUsername.userId, amount),
      metadata: { message },
      createRows: createTipRow,
    });
    if ("error" in result) return { error: result.error };
    if (!result.alreadySettled) {
      await notifyTipReceived({ recipientId: creatorUsername.userId, actorId: user.id });
      revalidatePath(`/${creatorHandle}`);
    }
    return { success: true };
  }

  // spec §3.5's third acceptance criterion, the literal gate: a creator
  // cannot receive a payout-requiring (card) transaction until their payout
  // account is active.
  const payoutAccount = await db.creatorPayoutAccount.findUnique({
    where: { userId: creatorUsername.userId },
  });
  if (!payoutAccount || payoutAccount.status !== "active" || !payoutAccount.processorAccountId) {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  const feeRate = await resolveFeeRate(db, creatorUsername.userId);
  const base = `${getAppOrigin()}/${creatorHandle}`;
  const { checkoutUrl } = await getPaymentProcessor().createPurchaseCheckoutSession({
    amount,
    currency: "usd",
    payerId: user.id,
    payerEmail: user.email,
    payeeProcessorAccountId: payoutAccount.processorAccountId,
    applicationFeeAmount: Math.round(amount * feeRate * 100) / 100,
    description: `Tip for @${creatorHandle}`,
    successUrl: `${base}?checkout=success`,
    cancelUrl: `${base}?checkout=cancelled`,
    metadata: {
      kind: "tip",
      payerId: user.id,
      payeeId: creatorUsername.userId,
      amount: String(amount),
      currency: "usd",
      message,
    },
  });

  redirect(checkoutUrl);
}

// Called from the Stripe webhook on checkout.session.completed once
// payment for a tip is confirmed — the real "charge succeeded" signal now
// that sendTip only starts a redirect. Idempotent on processorReference
// since Stripe can redeliver the same event.
// The Tip row itself — the one place it's created, reached by both the
// Stripe webhook (activateTip) and the coin rail (settleCoinPurchase),
// per addendum-coin-wallet-v2.md §6.2.
export async function createTipRow(tx: Prisma.TransactionClient, s: FeatureSettlement): Promise<void> {
  const message = s.metadata.message ?? "";
  await tx.tip.create({
    data: {
      fromUserId: s.payerId,
      toCreatorId: s.payeeId!,
      amount: s.amount,
      currency: s.currency,
      message: message.length > 0 ? message : null,
      paymentTransactionId: s.paymentTransactionId,
    },
  });
}

export async function activateTip(metadata: Record<string, string>, processorReference: string): Promise<void> {
  const already = await db.paymentTransaction.findFirst({ where: { processorReference, kind: "tip" } });
  if (already) return;

  const { payerId, payeeId, amount: amountStr, currency } = metadata;
  const amount = Number(amountStr);

  try {
    await db.$transaction(async (tx) => {
      const transaction = await recordPaymentTransaction(tx, {
        kind: "tip",
        payerId,
        payeeId,
        amount,
        currency,
        processorReference,
        status: "succeeded",
        relatedObjectType: "tip",
      });
      await createTipRow(tx, {
        paymentTransactionId: transaction.id,
        payerId,
        payeeId,
        amount,
        currency,
        metadata,
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.error(`activateTip: duplicate webhook delivery for ${processorReference} — already recorded, no-op.`);
      return;
    }
    throw err;
  }

  await notifyTipReceived({ recipientId: payeeId, actorId: payerId });

  const creatorUsername = await db.username.findUnique({ where: { userId: payeeId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}`);
}
