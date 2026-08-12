"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor, recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
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

  // spec §3.5's third acceptance criterion, the literal gate: a creator
  // cannot receive a payout-requiring transaction until their payout
  // account is active.
  const payoutAccount = await db.creatorPayoutAccount.findUnique({
    where: { userId: creatorUsername.userId },
  });
  if (!payoutAccount || payoutAccount.status !== "active" || !payoutAccount.processorAccountId) {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  if (!checkTipRateLimit(user.id)) {
    return { error: "You're sending tips too fast. Please slow down." };
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
export async function activateTip(metadata: Record<string, string>, processorReference: string): Promise<void> {
  const already = await db.paymentTransaction.findFirst({ where: { processorReference, kind: "tip" } });
  if (already) return;

  const { payerId, payeeId, amount: amountStr, currency, message } = metadata;
  const amount = Number(amountStr);

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
    await tx.tip.create({
      data: {
        fromUserId: payerId,
        toCreatorId: payeeId,
        amount,
        currency,
        message: message.length > 0 ? message : null,
        paymentTransactionId: transaction.id,
      },
    });
  });

  await notifyTipReceived({ recipientId: payeeId, actorId: payerId });

  const creatorUsername = await db.username.findUnique({ where: { userId: payeeId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}`);
}
