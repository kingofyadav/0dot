import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { recordPaymentTransaction } from "@/lib/payments";

// addendum-platform-billing.md §2.2: a plain Stripe Billing/Subscriptions
// integration (or equivalent), genuinely different from the Stripe Connect
// shape every other payment flow in this codebase uses (src/lib/payments.ts)
// — that one is built for facilitating payment *to* a third party; this one
// has no payee at all. Same "swap the class, not the callers" interface
// posture as PaymentProcessor.
export interface SubscriptionProcessor {
  readonly name: string;
  createSubscription(params: {
    subscriberId: string;
    plan: string;
    billingInterval: string;
    amount: number;
    currency: string;
  }): Promise<{ processorSubscriptionId: string; status: "succeeded" | "failed" }>;
  cancelSubscription(processorSubscriptionId: string): Promise<void>;
}

// Stub only — same posture as payments.ts's StubPaymentProcessor: no real
// hosted checkout or recurring-billing engine exists to wait on, so this
// short-circuits straight to `succeeded`. currentPeriodEnd is computed
// locally (periodEndFrom below) rather than driven by a webhook, the same
// documented stub limitation subscribeToTier (memberships.ts) already
// carries for MembershipSubscription.
class StubSubscriptionProcessor implements SubscriptionProcessor {
  readonly name = "stub";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is the SubscriptionProcessor interface contract; the stub doesn't need every argument.
  async createSubscription(params: { subscriberId: string; plan: string; billingInterval: string; amount: number; currency: string }) {
    return { processorSubscriptionId: `stub_sub_${randomBytes(8).toString("hex")}`, status: "succeeded" as const };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is the SubscriptionProcessor interface contract; the stub doesn't need the argument.
  async cancelSubscription(processorSubscriptionId: string): Promise<void> {
    // Nothing to call out to — status is flipped on our own row, same as
    // memberships.ts's cancelSubscription.
  }
}

const subscriptionProcessor: SubscriptionProcessor = new StubSubscriptionProcessor();

export function getSubscriptionProcessor(): SubscriptionProcessor {
  return subscriptionProcessor;
}

// premium-profiles addendum §7 / platform-billing addendum §6: no finance
// decision on price points exists yet — same "single flat placeholder,
// captured per-row at charge time" posture as payments.ts's
// PLATFORM_FEE_PERCENT, not a guess dressed up as a real price.
export const PLAN_PRICES: Record<string, { monthly: number; yearly: number; currency: string }> = {
  profile_premium: { monthly: 6, yearly: 60, currency: "usd" },
  business_subscription: { monthly: 20, yearly: 200, currency: "usd" },
};

export function priceFor(plan: string, billingInterval: string): { amount: number; currency: string } {
  const price = PLAN_PRICES[plan];
  if (!price) throw new Error(`No price configured for plan "${plan}"`);
  return { amount: billingInterval === "yearly" ? price.yearly : price.monthly, currency: price.currency };
}

export function periodEndFrom(billingInterval: string, from: Date): Date {
  const end = new Date(from);
  if (billingInterval === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

// Same "effective access computed live from status + currentPeriodEnd"
// shape as tier-access.ts's effectivelyActiveSubscription — a cancelled but
// not-yet-expired subscription still counts (premium-profiles addendum
// §4.2 / phase-5 §4.3's cancel-through-period-end rule).
const effectivelyActive = { OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }] };

export function getActiveProfileSubscription(profileId: string, plan = "profile_premium") {
  return db.platformSubscription.findFirst({
    where: { subscriberProfileId: profileId, plan, ...effectivelyActive },
    orderBy: { createdAt: "desc" },
  });
}

export async function isProfilePremium(profileId: string): Promise<boolean> {
  return (await getActiveProfileSubscription(profileId)) !== null;
}

// Reduced creator platform-fee discount (premium-profiles addendum §3.6)
// keys off the creator's own userId, since PaymentTransaction.payeeId is a
// User id, not a Profile id — payments.ts's recordPaymentTransaction calls
// this by userId, not profileId.
export async function isProfilePremiumByUserId(userId: string): Promise<boolean> {
  const subscription = await db.platformSubscription.findFirst({
    where: { plan: "profile_premium", subscriberProfile: { userId }, ...effectivelyActive },
    select: { id: true },
  });
  return subscription !== null;
}

export function getActiveBusinessSubscription(businessId: string) {
  return db.platformSubscription.findFirst({
    where: { subscriberBusinessId: businessId, plan: "business_subscription", ...effectivelyActive },
    orderBy: { createdAt: "desc" },
  });
}

export async function isBusinessSubscribed(businessId: string): Promise<boolean> {
  return (await getActiveBusinessSubscription(businessId)) !== null;
}

// premium-profiles addendum §3.4 / §5.1: link cap gating and its
// non-destructive downgrade counterpart. Free stays at Phase 1's existing
// 100-link soft cap (profile.ts/business-links.ts); premium raises it
// rather than removing it outright, matching the spec's "raise or remove"
// framing with a generous but still-bounded number.
export const FREE_LINK_CAP = 100;
export const PREMIUM_LINK_CAP = 1000;

export async function linkCapFor(profileId: string): Promise<number> {
  return (await isProfilePremium(profileId)) ? PREMIUM_LINK_CAP : FREE_LINK_CAP;
}

// premium-profiles addendum §3.3: the free tier's analytics query window —
// storage-layer retention is unaffected (link-stats.ts still logs/keeps
// every LinkClick regardless of tier), only how far back the dashboard
// query reaches.
export const FREE_ANALYTICS_WINDOW_DAYS = 30;

async function subscribe(params: {
  subscriberType: "profile" | "business";
  subscriberId: string; // profileId or businessId
  payerUserId: string;
  plan: string;
  billingInterval: string;
}) {
  const { amount, currency } = priceFor(params.plan, params.billingInterval);
  const charge = await subscriptionProcessor.createSubscription({
    subscriberId: params.subscriberId,
    plan: params.plan,
    billingInterval: params.billingInterval,
    amount,
    currency,
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." } as const;

  const now = new Date();
  const currentPeriodEnd = periodEndFrom(params.billingInterval, now);

  const subscription = await db.$transaction(async (tx) => {
    await recordPaymentTransaction(tx, {
      kind: "platform_subscription_charge",
      payerId: params.payerUserId,
      payeeId: null,
      amount,
      currency,
      processorReference: charge.processorSubscriptionId,
      status: "succeeded",
      relatedObjectType: params.plan,
      relatedObjectId: params.subscriberId,
    });
    return tx.platformSubscription.create({
      data: {
        subscriberType: params.subscriberType,
        subscriberProfileId: params.subscriberType === "profile" ? params.subscriberId : null,
        subscriberBusinessId: params.subscriberType === "business" ? params.subscriberId : null,
        plan: params.plan,
        status: "active",
        billingInterval: params.billingInterval,
        processorSubscriptionId: charge.processorSubscriptionId,
        currentPeriodEnd,
      },
    });
  });

  if (params.subscriberType === "profile") await reconcileLinkActivationForProfile(params.subscriberId);
  return { subscription } as const;
}

export async function subscribeProfilePremium(profileId: string, payerUserId: string, billingInterval: string) {
  return subscribe({ subscriberType: "profile", subscriberId: profileId, payerUserId, plan: "profile_premium", billingInterval });
}

export async function subscribeBusiness(businessId: string, payerUserId: string, billingInterval: string) {
  return subscribe({ subscriberType: "business", subscriberId: businessId, payerUserId, plan: "business_subscription", billingInterval });
}

// premium-profiles addendum §4.2: only flips status, never touches
// currentPeriodEnd — same shape as memberships.ts's cancelSubscription, so
// the effectively-active check above keeps granting access through the
// current period.
export async function cancelPlatformSubscription(subscriptionId: string): Promise<void> {
  const subscription = await db.platformSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.status !== "active") return;
  await db.platformSubscription.update({ where: { id: subscription.id }, data: { status: "cancelled" } });
  await subscriptionProcessor.cancelSubscription(subscription.processorSubscriptionId);
}

// premium-profiles addendum §5: excess links are marked inactive (never
// deleted) when a profile drops out of premium, and reactivated instantly
// on resubscription — called both right after subscribe() above and from
// the scheduler sweep below for lapses that happen passively (period end
// elapsing with no explicit cancel-then-resubscribe action).
export async function reconcileLinkActivationForProfile(profileId: string): Promise<void> {
  const cap = await linkCapFor(profileId);
  const links = await db.link.findMany({ where: { profileId }, orderBy: { position: "asc" }, select: { id: true, isActive: true } });

  const toActivate = links.slice(0, cap).filter((l) => !l.isActive).map((l) => l.id);
  const toDeactivate = links.slice(cap).filter((l) => l.isActive).map((l) => l.id);

  if (toActivate.length) await db.link.updateMany({ where: { id: { in: toActivate } }, data: { isActive: true } });
  if (toDeactivate.length) await db.link.updateMany({ where: { id: { in: toDeactivate } }, data: { isActive: false } });
}

// Sweeps every profile whose link count exceeds the free cap and who isn't
// currently premium (catches passive lapses — a subscription reaching
// currentPeriodEnd with no explicit cancel/resubscribe action in between,
// which nothing else would otherwise notice) and every currently-premium
// profile with links still marked inactive from a past downgrade (catches
// resubscription after a lapse that the subscribe() call above didn't
// itself trigger, e.g. the processor reactivating a past_due subscription).
async function sweepLinkActivation(): Promise<void> {
  const candidateProfileIds = await db.profile.findMany({
    where: {
      OR: [
        { links: { some: { position: { gte: FREE_LINK_CAP }, isActive: true } } },
        { links: { some: { isActive: false } } },
      ],
    },
    select: { id: true },
  });
  for (const { id } of candidateProfileIds) await reconcileLinkActivationForProfile(id);
}

const LAPSE_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // frequent enough that a lapsed link cap doesn't stay visible for long, cheap enough given the narrow candidate query above

const globalForPlatformBilling = globalThis as unknown as { platformBillingSchedulerStarted?: boolean };

export function startPlatformBillingScheduler(): void {
  if (globalForPlatformBilling.platformBillingSchedulerStarted) return;
  globalForPlatformBilling.platformBillingSchedulerStarted = true;

  const tick = () => void sweepLinkActivation();
  tick();
  setInterval(tick, LAPSE_SWEEP_INTERVAL_MS);
}
