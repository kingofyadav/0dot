import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { recordPaymentTransaction } from "@/lib/payments";
import { stripe, getOrCreateStripeCustomerId } from "@/lib/stripe";

// addendum-platform-billing.md §2.2: a plain Stripe Billing/Subscriptions
// integration, genuinely different from the Stripe Connect shape every
// other payment flow in this codebase uses (src/lib/payments.ts) — that
// one is built for facilitating payment *to* a third party; this one has
// no payee at all. Same "swap the class, not the callers" interface
// posture as PaymentProcessor, now backed by real Stripe Checkout
// (subscription mode) instead of a stub. A hosted Checkout redirect is
// inherently async — payment isn't confirmed until Stripe calls back the
// webhook (activateSubscriptionFromCheckout below), so this interface
// returns a URL to redirect to, not a synchronous succeeded/failed result.
export interface SubscriptionProcessor {
  readonly name: string;
  createCheckoutSession(params: {
    subscriberType: "profile" | "business";
    subscriberId: string;
    payerUserId: string;
    payerEmail: string;
    plan: string;
    billingInterval: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  cancelSubscription(processorSubscriptionId: string): Promise<void>;
}

// One Stripe Product per plan (never per plan+interval — mixing tiers on
// one Product makes every Checkout/invoice line item show the same name,
// per the stripe-best-practices skill's billing reference), monthly/yearly
// as separate Prices on that Product.
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  profile_premium: "0dot Premium Profile",
  business_subscription: "0dot Business Subscription",
};

// Prices are immutable in Stripe — looked up by a stable lookup_key
// (plan_interval) so re-runs reuse the same Price instead of minting a
// duplicate every checkout, and created on first use so there's no manual
// Dashboard step to wire a plan up. If PLAN_PRICES below ever changes,
// bump the lookup_key (e.g. "_v2") rather than editing amounts in place —
// Stripe Prices can't be mutated once created.
const priceIdCache = new Map<string, string>();

async function ensurePriceId(plan: string, billingInterval: string): Promise<string> {
  const cacheKey = `${plan}:${billingInterval}`;
  const cached = priceIdCache.get(cacheKey);
  if (cached) return cached;

  const lookupKey = `${plan}_${billingInterval}`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    priceIdCache.set(cacheKey, existing.data[0].id);
    return existing.data[0].id;
  }

  const { amount, currency } = priceFor(plan, billingInterval);
  const price = await stripe.prices.create({
    currency,
    unit_amount: Math.round(amount * 100),
    recurring: { interval: billingInterval === "yearly" ? "year" : "month" },
    lookup_key: lookupKey,
    product_data: { name: PLAN_DISPLAY_NAMES[plan] ?? plan },
  });
  priceIdCache.set(cacheKey, price.id);
  return price.id;
}

class StripeSubscriptionProcessor implements SubscriptionProcessor {
  readonly name = "stripe";

  async createCheckoutSession(params: {
    subscriberType: "profile" | "business";
    subscriberId: string;
    payerUserId: string;
    payerEmail: string;
    plan: string;
    billingInterval: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string }> {
    const priceId = await ensurePriceId(params.plan, params.billingInterval);
    const customerId = await getOrCreateStripeCustomerId(params.payerUserId, params.payerEmail);

    // No payment_method_types here (stripe-best-practices skill): omitting
    // it lets Stripe choose eligible methods dynamically from the Dashboard
    // config instead of hardcoding to card only.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: `${params.subscriberType}:${params.subscriberId}`,
      // Read back by the webhook (activateSubscriptionFromCheckout) — the
      // session itself, not this metadata, is the trigger; this is just how
      // it learns which PlatformSubscription row to create.
      metadata: {
        kind: "platform_subscription",
        subscriberType: params.subscriberType,
        subscriberId: params.subscriberId,
        payerUserId: params.payerUserId,
        plan: params.plan,
        billingInterval: params.billingInterval,
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url };
  }

  async cancelSubscription(processorSubscriptionId: string): Promise<void> {
    await stripe.subscriptions.update(processorSubscriptionId, { cancel_at_period_end: true });
  }
}

const subscriptionProcessor: SubscriptionProcessor = new StripeSubscriptionProcessor();

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

// Starts a real Stripe Checkout redirect rather than writing a
// PlatformSubscription row synchronously — a hosted-checkout redirect can't
// confirm payment within this same request. The row is created by
// activateSubscriptionFromCheckout below, once Stripe's webhook confirms
// checkout.session.completed.
async function subscribe(params: {
  subscriberType: "profile" | "business";
  subscriberId: string; // profileId or businessId
  payerUserId: string;
  payerEmail: string;
  plan: string;
  billingInterval: string;
  successUrl: string;
  cancelUrl: string;
}) {
  priceFor(params.plan, params.billingInterval); // throws early for an unconfigured plan, before ever calling Stripe
  const { checkoutUrl } = await subscriptionProcessor.createCheckoutSession(params);
  return { checkoutUrl } as const;
}

export async function subscribeBusiness(
  businessId: string,
  payerUserId: string,
  payerEmail: string,
  billingInterval: string,
  successUrl: string,
  cancelUrl: string
) {
  return subscribe({ subscriberType: "business", subscriberId: businessId, payerUserId, payerEmail, plan: "business_subscription", billingInterval, successUrl, cancelUrl });
}

// Called from the Stripe webhook route on checkout.session.completed —
// this is the real "payment succeeded" signal now, replacing what used to
// be subscribe()'s synchronous row-create. Idempotent on
// processorSubscriptionId since Stripe can redeliver the same event.
export async function activateSubscriptionFromCheckout(params: {
  subscriberType: "profile" | "business";
  subscriberId: string;
  payerUserId: string;
  plan: string;
  billingInterval: string;
  processorSubscriptionId: string;
  currentPeriodEnd: Date;
  amount: number;
  currency: string;
}): Promise<void> {
  const already = await db.platformSubscription.findFirst({ where: { processorSubscriptionId: params.processorSubscriptionId } });
  if (already) return;

  await db.$transaction(async (tx) => {
    await recordPaymentTransaction(tx, {
      kind: "platform_subscription_charge",
      payerId: params.payerUserId,
      payeeId: null,
      amount: params.amount,
      currency: params.currency,
      processorReference: params.processorSubscriptionId,
      status: "succeeded",
      relatedObjectType: params.plan,
      relatedObjectId: params.subscriberId,
    });
    await tx.platformSubscription.create({
      data: {
        subscriberType: params.subscriberType,
        subscriberProfileId: params.subscriberType === "profile" ? params.subscriberId : null,
        subscriberBusinessId: params.subscriberType === "business" ? params.subscriberId : null,
        plan: params.plan,
        status: "active",
        billingInterval: params.billingInterval,
        processorSubscriptionId: params.processorSubscriptionId,
        currentPeriodEnd: params.currentPeriodEnd,
      },
    });
  });

  if (params.subscriberType === "profile") await reconcileLinkActivationForProfile(params.subscriberId);
}

// Stripe's own subscription.status is the single source of truth for
// renewal/dunning/final-cancellation — mapped onto this model's narrower
// active|past_due|cancelled vocabulary (schema comment on
// PlatformSubscription.status). Called from the webhook route on
// customer.subscription.updated/deleted, which fire for every renewal, so
// this is also how currentPeriodEnd advances each period — nothing else in
// this file recomputes it.
const STRIPE_STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "past_due",
  canceled: "cancelled",
  incomplete_expired: "cancelled",
};

export async function syncSubscriptionFromStripe(processorSubscriptionId: string, stripeStatus: string, currentPeriodEnd: Date): Promise<void> {
  const subscription = await db.platformSubscription.findFirst({ where: { processorSubscriptionId } });
  if (!subscription) return; // not one of ours, or checkout.session.completed hasn't landed yet

  const status = STRIPE_STATUS_MAP[stripeStatus] ?? subscription.status;
  await db.platformSubscription.update({ where: { id: subscription.id }, data: { status, currentPeriodEnd } });

  if (subscription.subscriberProfileId) await reconcileLinkActivationForProfile(subscription.subscriberProfileId);
}

// premium-profiles addendum §4.2: only flips status, never touches
// currentPeriodEnd — same shape as memberships.ts's cancelSubscription, so
// the effectively-active check above keeps granting access through the
// current period. Cancels at Stripe first, local row second — with a real
// processor (no longer a no-op stub) a failed Stripe call must not leave
// this row marked cancelled while Stripe keeps billing it.
export async function cancelPlatformSubscription(subscriptionId: string): Promise<void> {
  const subscription = await db.platformSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.status !== "active") return;
  // Coin-funded rows (purchaseProfilePremiumWithCoins below) have no real
  // Stripe subscription behind processorSubscriptionId — nothing to cancel
  // upstream, and calling Stripe with that id would just throw.
  if (!subscription.processorSubscriptionId.startsWith(COIN_FUNDED_MARKER)) {
    await subscriptionProcessor.cancelSubscription(subscription.processorSubscriptionId);
  }
  await db.platformSubscription.update({ where: { id: subscription.id }, data: { status: "cancelled" } });
}

// wallet.ts's alternate payment rail into this exact same
// PlatformSubscription model/plan Stripe Checkout writes to via
// activateSubscriptionFromCheckout above — every real perk
// (linkCapFor/isProfilePremium/analytics window/etc.) Just Works for a
// coin-funded row with no separate gating logic needed. Coin cost is
// TEST_MODE_VIP_COIN_COST below, not PLAN_PRICES (see that constant for
// why); marked via a processorSubscriptionId prefix rather than a new
// column, same "string discriminator" shape this schema already uses for
// subscriberType/plan/status.
export const COIN_FUNDED_MARKER = "coin:";

function addBillingInterval(date: Date, billingInterval: string): Date {
  const next = new Date(date);
  if (billingInterval === "yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

// Renews by extending the existing coin-funded row (early renewal just
// pushes currentPeriodEnd out further) rather than stacking a new row per
// purchase — but a Stripe-funded row is left alone entirely, since Stripe
// remains the source of truth for its own subscription's renewal per the
// schema comment on processorSubscriptionId; the caller is expected to have
// already refused the purchase in that case (subscriberProfile is already
// covered, no coins should be spent at all).
// Sentinel thrown inside the transaction below to short-circuit on
// insufficient balance without committing the partial debit — caught right
// outside and turned back into the ActionState-shaped error the callers
// expect.
class InsufficientCoinsError extends Error {}

// No real payment/billing right now — every account already gets 1 coin on
// signup (auth.ts), so this lets that alone unlock every Premium perk for
// testing. Deliberately decoupled from PLAN_PRICES/priceFor (still the real
// $6/$60 price, kept for the Stripe rail and for restoring the coin cost
// later) rather than reusing it, so re-enabling real pricing is a one-line
// revert instead of untangling this from Stripe's numbers.
export const TEST_MODE_VIP_COIN_COST = 1;

export async function purchaseProfilePremiumWithCoins(userId: string, profileId: string, billingInterval: string): Promise<{ error?: string }> {
  const coinCost = TEST_MODE_VIP_COIN_COST;
  const existing = await getActiveProfileSubscription(profileId);
  if (existing && !existing.processorSubscriptionId.startsWith(COIN_FUNDED_MARKER)) {
    return { error: "You already have Premium through a card subscription." };
  }

  try {
    // Debit and subscription row must land together — a crash between the
    // two (e.g. process restart) must never leave a user's coins spent with
    // no subscription to show for it, same posture as
    // activateSubscriptionFromCheckout's recordPaymentTransaction+create pair.
    await db.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: userId, coinBalance: { gte: coinCost } },
        data: { coinBalance: { decrement: coinCost } },
      });
      if (debited.count === 0) throw new InsufficientCoinsError();

      if (existing) {
        await tx.platformSubscription.update({
          where: { id: existing.id },
          data: { currentPeriodEnd: addBillingInterval(existing.currentPeriodEnd, billingInterval), billingInterval },
        });
      } else {
        await tx.platformSubscription.create({
          data: {
            subscriberType: "profile",
            subscriberProfileId: profileId,
            plan: "profile_premium",
            status: "active",
            billingInterval,
            processorSubscriptionId: `${COIN_FUNDED_MARKER}${randomUUID()}`,
            currentPeriodEnd: addBillingInterval(new Date(), billingInterval),
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof InsufficientCoinsError) return { error: `You need ${coinCost} coins for this plan.` };
    throw err;
  }

  await reconcileLinkActivationForProfile(profileId);
  return {};
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

// Stripe-funded rows get their status kept truthful by the webhook
// (syncSubscriptionFromStripe, fired off Stripe's own renewal/dunning
// events) — effectivelyActive above trusts a bare "active" status without
// re-checking currentPeriodEnd for exactly that reason. Coin-funded rows
// have no processor behind them to fire that webhook, so without this sweep
// a coin purchase that's never renewed would grant Premium forever: status
// stays "active" past currentPeriodEnd and effectivelyActive keeps counting
// it. This is the coin-rail's only "period ended" signal, so it must run
// before sweepLinkActivation each tick (which relies on status already
// reflecting the lapse to know which profiles need their links deactivated).
async function expireLapsedCoinSubscriptions(): Promise<void> {
  const lapsed = await db.platformSubscription.findMany({
    where: { status: "active", processorSubscriptionId: { startsWith: COIN_FUNDED_MARKER }, currentPeriodEnd: { lt: new Date() } },
    select: { id: true, subscriberProfileId: true },
  });
  if (!lapsed.length) return;

  await db.platformSubscription.updateMany({
    where: { id: { in: lapsed.map((s) => s.id) } },
    data: { status: "cancelled" },
  });
  for (const { subscriberProfileId } of lapsed) {
    if (subscriberProfileId) await reconcileLinkActivationForProfile(subscriberProfileId);
  }
}

const LAPSE_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // frequent enough that a lapsed link cap doesn't stay visible for long, cheap enough given the narrow candidate query above

const globalForPlatformBilling = globalThis as unknown as { platformBillingSchedulerStarted?: boolean };

export function startPlatformBillingScheduler(): void {
  if (globalForPlatformBilling.platformBillingSchedulerStarted) return;
  globalForPlatformBilling.platformBillingSchedulerStarted = true;

  const tick = () =>
    void (async () => {
      await expireLapsedCoinSubscriptions();
      await sweepLinkActivation();
    })();
  tick();
  setInterval(tick, LAPSE_SWEEP_INTERVAL_MS);
}
