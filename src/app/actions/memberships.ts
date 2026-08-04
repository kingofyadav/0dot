"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor, recordPaymentTransaction } from "@/lib/payments";
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

function periodEndFrom(billingInterval: string, from: Date): Date {
  const end = new Date(from);
  if (billingInterval === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

// spec §4.1/§4.3: charges the fan for one billing period via the payments
// backbone (kind: membership_charge), then creates the subscription row.
// currentPeriodEnd is set directly here rather than driven by a processor
// webhook — this build's stub processor (src/lib/payments.ts) has no real
// recurring-billing engine behind it, so renewal is simulated as
// immediately-active for one period, a documented stub limitation (same
// posture as StubPaymentProcessor's payout-account status), not a real
// subscription-billing implementation.
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
  if (!payoutAccount || payoutAccount.status !== "active") {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  if (!checkSubscribeRateLimit(user.id)) {
    return { error: "You're subscribing too fast. Please slow down." };
  }

  const charge = await getPaymentProcessor().charge({
    amount: tier.price,
    currency: tier.currency,
    payerId: user.id,
    payeeId: tier.creatorId,
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." };

  const affiliateLink = await getAttributedAffiliateLink("membership_tier", tier.id, user.id);

  const now = new Date();
  const creditedAffiliate = await db.$transaction(async (tx) => {
    await recordPaymentTransaction(tx, {
      kind: "membership_charge",
      payerId: user.id,
      payeeId: tier.creatorId,
      amount: tier.price,
      currency: tier.currency,
      processorReference: charge.processorReference,
      status: "succeeded",
      relatedObjectType: "membership_tier",
      relatedObjectId: tier.id,
    });
    await tx.membershipSubscription.create({
      data: {
        tierId: tier.id,
        fanId: user.id,
        status: "active",
        currentPeriodEnd: periodEndFrom(tier.billingInterval, now),
        // No distinct recurring-billing object exists in the stub
        // processor (only a one-time charge() was called above) — reusing
        // the charge's own reference here is the documented stub
        // limitation, not a real Stripe subscription id.
        processorSubscriptionId: charge.processorReference,
      },
    });

    if (!affiliateLink) return null;
    return creditAffiliateConversion(tx, {
      affiliateLink,
      saleAmount: tier.price,
      currency: tier.currency,
      saleProcessorReference: charge.processorReference,
    });
  });
  if (creditedAffiliate) await notifyAffiliateConversion({ recipientId: creditedAffiliate.affiliateId, actorId: user.id });

  await notifyNewSubscriber({ recipientId: tier.creatorId, actorId: user.id });

  const creatorUsername = await db.username.findUnique({ where: { userId: tier.creatorId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}`);
  return undefined;
}

// spec §4.3's third literal criterion: cancelling retains access through
// current_period_end, not immediately — this only flips status, it never
// touches currentPeriodEnd, and hasTierAccess (src/lib/tier-access.ts)
// treats a cancelled-but-not-yet-expired row as still granting access.
export async function cancelSubscription(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return;

  const subscription = await db.membershipSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.fanId !== user.id) return;
  if (subscription.status !== "active") return;

  await db.membershipSubscription.update({ where: { id: subscription.id }, data: { status: "cancelled" } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}
