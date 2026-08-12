"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor, recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { getAppOrigin } from "@/lib/email";
import { notifyNewSubscriber, notifyAffiliateConversion } from "@/lib/notifications";
import { getAttributedAffiliateLink, creditAffiliateConversion } from "@/lib/affiliate";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const BILLING_INTERVAL_VALUES = new Set(["monthly", "yearly"]);
const STATUS_VALUES = new Set(["active", "archived"]);

// Same convention tips.ts's checkTipRateLimit established for this exact
// class of action (repeated charge attempts against the payment
// processor) — subscribeToTier moves real money too and had no guard.
function checkSubscribeRateLimit(userId: string): boolean {
  return checkRateLimit(`membership-subscribe:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

type TierFields = {
  name: string;
  level: number;
  price: number;
  currency: string;
  billingInterval: string;
  description: string;
  status: string;
};

function parseAndValidateTierFields(formData: FormData): { error: string } | TierFields {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 60) return { error: "Name must be 1-60 characters." };

  const level = Number(formData.get("level"));
  if (!Number.isInteger(level) || level < 1) return { error: "Level must be a positive whole number." };

  const price = Number(formData.get("price"));
  if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive number." };

  const currency = String(formData.get("currency") ?? "usd").trim().toLowerCase() || "usd";

  const billingInterval = String(formData.get("billingInterval") ?? "");
  if (!BILLING_INTERVAL_VALUES.has(billingInterval)) return { error: "Choose a billing interval." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1000) return { error: "Description must be 1000 characters or fewer." };

  const statusRaw = String(formData.get("status") ?? "active");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "active";

  return { name, level, price, currency, billingInterval, description, status };
}

// spec §4: owner-only tier CRUD, same shape as offerings.ts — a creator
// manages their own MembershipTier rows directly (no separate capability
// helper needed the way Offering needs canManageCatalog, since a tier only
// ever has one owner, never a team).
export async function createTier(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const fields = parseAndValidateTierFields(formData);
  if ("error" in fields) return fields;

  await db.membershipTier.create({ data: { creatorId: user.id, ...fields } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function updateTier(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const tierId = String(formData.get("tierId") ?? "");

  const tier = await db.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier) return { error: "Tier not found." };
  if (tier.creatorId !== user.id) return { error: "You don't have permission to manage this tier." };

  const fields = parseAndValidateTierFields(formData);
  if ("error" in fields) return fields;

  await db.membershipTier.update({ where: { id: tier.id }, data: fields });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function archiveTier(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const tierId = String(formData.get("tierId") ?? "");
  if (!tierId) return;

  const tier = await db.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.creatorId !== user.id) return;

  // Archiving a tier deliberately doesn't touch existing subscriptions or
  // gated posts — an archived tier just stops being offered to new
  // subscribers (see the subscribeToTier status check below); current
  // subscribers keep the access their subscription already grants.
  await db.membershipTier.update({ where: { id: tier.id }, data: { status: "archived" } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §4.1/§4.3: starts a real Stripe Connect subscription checkout
// (kind: membership_charge on the ledger once confirmed) instead of
// charging synchronously — a hosted Checkout redirect can't confirm
// payment within this same request. The MembershipSubscription row is
// created by activateMembershipSubscription below, once Stripe's webhook
// confirms checkout.session.completed; currentPeriodEnd afterward is
// Stripe's own subscription object, kept in sync by syncMembershipFromStripe
// on every customer.subscription.updated (real recurring billing now, not
// the one-period-then-frozen simulation the old stub processor required).
export async function subscribeToTier(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const tierId = String(formData.get("tierId") ?? "");

  const tier = await db.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.status !== "active") return { error: "This membership tier isn't available." };
  if (tier.creatorId === user.id) return { error: "You can't subscribe to your own tier." };

  const existing = await db.membershipSubscription.findFirst({
    where: {
      fanId: user.id,
      tierId: tier.id,
      OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }],
    },
  });
  if (existing) return { error: "You're already subscribed to this tier." };

  // spec §3.5's literal gate, same check tips.ts's sendTip already
  // enforces for a different money-moving feature: a creator cannot
  // receive a payout-requiring transaction until their payout account is
  // active.
  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: tier.creatorId } });
  if (!payoutAccount || payoutAccount.status !== "active" || !payoutAccount.processorAccountId) {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  if (!checkSubscribeRateLimit(user.id)) {
    return { error: "You're subscribing too fast. Please slow down." };
  }

  const affiliateLink = await getAttributedAffiliateLink("membership_tier", tier.id, user.id);

  const feeRate = await resolveFeeRate(db, tier.creatorId);
  const creatorHandle = (await db.username.findUnique({ where: { userId: tier.creatorId }, select: { handle: true } }))?.handle ?? "";
  const base = `${getAppOrigin()}/${creatorHandle}`;
  const { checkoutUrl } = await getPaymentProcessor().createSubscriptionCheckoutSession({
    amount: tier.price,
    currency: tier.currency,
    billingInterval: tier.billingInterval,
    payerId: user.id,
    payerEmail: user.email,
    payeeProcessorAccountId: payoutAccount.processorAccountId,
    applicationFeePercent: feeRate,
    description: `${tier.name} membership`,
    successUrl: `${base}?checkout=success`,
    cancelUrl: `${base}?checkout=cancelled`,
    metadata: {
      kind: "membership",
      payerId: user.id,
      payeeId: tier.creatorId,
      tierId: tier.id,
      amount: String(tier.price),
      currency: tier.currency,
      billingInterval: tier.billingInterval,
      affiliateLinkId: affiliateLink?.id ?? "",
      affiliateId: affiliateLink?.affiliateId ?? "",
      affiliateCommissionPercent: affiliateLink ? String(affiliateLink.program.commissionPercent) : "",
    },
  });

  redirect(checkoutUrl);
}

// Called from the Stripe webhook on checkout.session.completed once a
// membership subscription's first payment is confirmed. Idempotent on
// processorSubscriptionId since Stripe can redeliver the same event.
export async function activateMembershipSubscription(params: {
  metadata: Record<string, string>;
  processorSubscriptionId: string;
  currentPeriodEnd: Date;
}): Promise<void> {
  const already = await db.membershipSubscription.findFirst({ where: { processorSubscriptionId: params.processorSubscriptionId } });
  if (already) return;

  const { payerId, payeeId, tierId, amount: amountStr, currency, affiliateLinkId, affiliateId, affiliateCommissionPercent } = params.metadata;
  const amount = Number(amountStr);
  const affiliateLink =
    affiliateLinkId && affiliateId && affiliateCommissionPercent
      ? { id: affiliateLinkId, affiliateId, program: { commissionPercent: Number(affiliateCommissionPercent) } }
      : null;

  const creditedAffiliate = await db.$transaction(async (tx) => {
    await recordPaymentTransaction(tx, {
      kind: "membership_charge",
      payerId,
      payeeId,
      amount,
      currency,
      processorReference: params.processorSubscriptionId,
      status: "succeeded",
      relatedObjectType: "membership_tier",
      relatedObjectId: tierId,
    });
    await tx.membershipSubscription.create({
      data: {
        tierId,
        fanId: payerId,
        status: "active",
        currentPeriodEnd: params.currentPeriodEnd,
        processorSubscriptionId: params.processorSubscriptionId,
      },
    });

    if (!affiliateLink) return null;
    return creditAffiliateConversion(tx, {
      affiliateLink,
      saleAmount: amount,
      currency,
      saleProcessorReference: params.processorSubscriptionId,
    });
  });
  if (creditedAffiliate) await notifyAffiliateConversion({ recipientId: creditedAffiliate.affiliateId, actorId: payerId });

  await notifyNewSubscriber({ recipientId: payeeId, actorId: payerId });

  const creatorUsername = await db.username.findUnique({ where: { userId: payeeId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}`);
}

// Stripe's own subscription.status is the source of truth for renewal/
// dunning/final-cancellation, mirroring platform-billing.ts's
// syncSubscriptionFromStripe for the same reason — called from the webhook
// on customer.subscription.updated/deleted, which fire for every renewal,
// so this is also how currentPeriodEnd advances each period.
const STRIPE_STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "past_due",
  canceled: "cancelled",
  incomplete_expired: "cancelled",
};

export async function syncMembershipFromStripe(processorSubscriptionId: string, stripeStatus: string, currentPeriodEnd: Date): Promise<void> {
  const subscription = await db.membershipSubscription.findFirst({ where: { processorSubscriptionId } });
  if (!subscription) return; // not one of ours, or checkout.session.completed hasn't landed yet

  const status = STRIPE_STATUS_MAP[stripeStatus] ?? subscription.status;
  await db.membershipSubscription.update({ where: { id: subscription.id }, data: { status, currentPeriodEnd } });
}

// spec §4.3's third literal criterion: cancelling retains access through
// current_period_end, not immediately — this only flips status, it never
// touches currentPeriodEnd, and hasTierAccess (src/lib/tier-access.ts)
// treats a cancelled-but-not-yet-expired row as still granting access.
// Cancels at Stripe first, local row second — with a real processor (no
// longer a no-op stub) a failed Stripe call must not leave this row marked
// cancelled while Stripe keeps billing it, same reasoning
// platform-billing.ts's cancelPlatformSubscription now follows.
export async function cancelSubscription(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return;

  const subscription = await db.membershipSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.fanId !== user.id) return;
  if (subscription.status !== "active") return;

  await getPaymentProcessor().cancelSubscription(subscription.processorSubscriptionId);
  await db.membershipSubscription.update({ where: { id: subscription.id }, data: { status: "cancelled" } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}
