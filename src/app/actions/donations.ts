"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor, recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { getAppOrigin } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MIN_DONATION_AMOUNT = 1;
const MAX_DONATION_AMOUNT = 5000;

// phase-16 spec §11: organizer can be user | business | organization in the
// schema, but this build only wires up the user-organizer creation path —
// a fundraiser run by an individual is the smallest complete instance of
// the feature. Business/organization organizer creation UI is a
// straightforward extension of this same action (organizerBusinessId/
// organizerOrganizationId are already columns), left for when actually
// requested, same "narrow MVP first" posture as CRM's fixed pipeline.
export async function createFundraisingCampaign(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 160) return { error: "Title must be 1-160 characters." };

  const currency = String(formData.get("currency") ?? "usd").trim().toLowerCase();
  const goalRaw = String(formData.get("goalAmount") ?? "").trim();
  const goalAmount = goalRaw ? Number(goalRaw) : null;
  if (goalAmount !== null && (!Number.isFinite(goalAmount) || goalAmount <= 0)) {
    return { error: "Goal amount must be a positive number." };
  }

  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "Invalid end date." };

  const campaign = await db.fundraisingCampaign.create({
    data: {
      organizerType: "user",
      organizerUserId: user.id,
      title,
      goalAmount,
      currency,
      endsAt,
    },
  });

  redirect(`/fund/${campaign.id}`);
}

export async function cancelFundraisingCampaign(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const id = String(formData.get("campaignId") ?? "");
  const campaign = await db.fundraisingCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.organizerUserId !== user.id) return;

  await db.fundraisingCampaign.update({ where: { id }, data: { status: "cancelled" } });
  revalidatePath(`/fund/${id}`);
}

// spec §11: at least the fourth reuse of the PaymentTransaction ledger —
// same "charge, then record ledger + feature row in one transaction, only
// after processor.charge() succeeds" shape as sendTip (tips.ts).
export async function donate(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const isAnonymous = formData.get("isAnonymous") === "true";

  const campaign = await db.fundraisingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "active") return { error: "This campaign isn't accepting donations." };
  if (campaign.endsAt && campaign.endsAt < new Date()) return { error: "This campaign has ended." };

  const rawAmount = Number(formData.get("amount"));
  const amount = Math.round(rawAmount * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_DONATION_AMOUNT || amount > MAX_DONATION_AMOUNT) {
    return { error: `Donation amount must be between $${MIN_DONATION_AMOUNT} and $${MAX_DONATION_AMOUNT}.` };
  }

  if (!checkRateLimit(`donate:${user.id}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: "You're donating too fast. Please slow down." };
  }

  if (campaign.organizerType !== "user" || !campaign.organizerUserId) {
    return { error: "This campaign's payout route isn't supported yet." };
  }
  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: campaign.organizerUserId } });
  if (!payoutAccount || payoutAccount.status !== "active" || !payoutAccount.processorAccountId) {
    return { error: "This fundraiser hasn't enabled payouts yet." };
  }

  const feeRate = await resolveFeeRate(db, campaign.organizerUserId);
  const base = `${getAppOrigin()}/fund/${campaign.id}`;
  const { checkoutUrl } = await getPaymentProcessor().createPurchaseCheckoutSession({
    amount,
    currency: campaign.currency,
    payerId: user.id,
    payerEmail: user.email,
    payeeProcessorAccountId: payoutAccount.processorAccountId,
    applicationFeeAmount: Math.round(amount * feeRate * 100) / 100,
    description: `Donation to ${campaign.title}`,
    successUrl: `${base}?checkout=success`,
    cancelUrl: `${base}?checkout=cancelled`,
    metadata: {
      kind: "donation",
      payerId: user.id,
      payeeId: campaign.organizerUserId,
      campaignId: campaign.id,
      amount: String(amount),
      currency: campaign.currency,
      message,
      isAnonymous: String(isAnonymous),
    },
  });

  redirect(checkoutUrl);
}

// Called from the Stripe webhook on checkout.session.completed once
// payment for a donation is confirmed — real "charge succeeded" signal now
// that donate() only starts a redirect. Idempotent on processorReference.
export async function activateDonation(metadata: Record<string, string>, processorReference: string): Promise<void> {
  const already = await db.paymentTransaction.findFirst({ where: { processorReference, kind: "donation" } });
  if (already) return;

  const { payerId, payeeId, campaignId, amount: amountStr, currency, message, isAnonymous } = metadata;
  const amount = Number(amountStr);

  await db.$transaction(async (tx) => {
    const transaction = await recordPaymentTransaction(tx, {
      kind: "donation",
      payerId,
      payeeId,
      amount,
      currency,
      processorReference,
      status: "succeeded",
      relatedObjectType: "fundraising_campaign",
      relatedObjectId: campaignId,
    });
    await tx.donation.create({
      data: {
        campaignId,
        donorId: payerId,
        amount,
        currency,
        message: message.length > 0 ? message : null,
        isAnonymous: isAnonymous === "true",
        paymentTransactionId: transaction.id,
      },
    });
    await tx.fundraisingCampaign.update({
      where: { id: campaignId },
      data: { raisedAmount: { increment: amount } },
    });
  });

  revalidatePath(`/fund/${campaignId}`);
}
