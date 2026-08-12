import "server-only";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { recordPaymentTransaction } from "@/lib/payments";
import { stripe, getOrCreateStripeCustomerId } from "@/lib/stripe";

// billing addendum §4.1: meters against Phase 10 §5.3's *existing*
// aggregated ApiUsageCounter rows — no parallel per-request billing log.
// Prices are finance-TBD placeholders, same posture as
// PLATFORM_FEE_PERCENT/PLAN_PRICES elsewhere in this billing layer.
const INCLUDED_FREE_REQUESTS_PER_PERIOD = 10_000; // pay_as_you_go's first N requests/period are free, matching the free plan's own rough hourly cap scaled to a month
const PRICE_PER_1000_REQUESTS_OVER = 0.5; // usd
const COMMITTED_PLAN_FLAT_PRICE = 49; // usd/period — a prepaid commitment, charged regardless of usage
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// Per the stripe-best-practices skill's billing reference: basic Stripe
// Billing Meters, not Metronome — Metronome is the recommendation for a
// *new* usage-based-billing integration in general, but the skill's own
// carve-out ("simple pay-as-you-go needs with an existing Stripe Billing
// integration") is a literal description of this feature, and Metronome
// isn't in the Vercel Marketplace catalog at all (would need a separate
// external account this session can't provision). A direct-to-platform
// charge (payeeId: null on the ledger, same as platform-billing.ts), so
// this uses the plain stripe.ts client, never payments.ts's Connect
// processor — no connected account involved.
const METER_EVENT_NAME = "api_request_overage";
let meterIdCache: string | undefined;

async function ensureMeterId(): Promise<string> {
  if (meterIdCache) return meterIdCache;
  const existing = await stripe.billing.meters.list({ status: "active", limit: 100 });
  const found = existing.data.find((m) => m.event_name === METER_EVENT_NAME);
  if (found) {
    meterIdCache = found.id;
    return found.id;
  }
  const meter = await stripe.billing.meters.create({
    display_name: "API request overage",
    event_name: METER_EVENT_NAME,
    default_aggregation: { formula: "sum" },
  });
  meterIdCache = meter.id;
  return meter.id;
}

// Free allowance is subtracted on our own side (settleAppUsage below only
// ever reports the overage, never total requests) rather than modeled as a
// Stripe tiered price — a flat per-unit metered price keeps the Stripe-side
// config simple, and INCLUDED_FREE_REQUESTS_PER_PERIOD already needs to
// live somewhere; duplicating it into a Stripe tier would be one more place
// for it to drift.
const overagePriceCache = new Map<string, string>();

async function ensureOveragePriceId(): Promise<string> {
  const cached = overagePriceCache.get("overage");
  if (cached) return cached;

  const lookupKey = "api_usage_overage_per_request";
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    overagePriceCache.set("overage", existing.data[0].id);
    return existing.data[0].id;
  }

  const meterId = await ensureMeterId();
  const price = await stripe.prices.create({
    currency: "usd",
    // PRICE_PER_1000_REQUESTS_OVER dollars per 1000 requests, as a
    // per-request decimal amount in cents (e.g. $0.50/1000 = $0.0005/request
    // = "0.05" cents).
    unit_amount_decimal: Stripe.Decimal.from((PRICE_PER_1000_REQUESTS_OVER / 1000) * 100),
    recurring: { interval: "month", usage_type: "metered", meter: meterId },
    lookup_key: lookupKey,
    product_data: { name: "API usage overage" },
  });
  overagePriceCache.set("overage", price.id);
  return price.id;
}

const committedPriceCache = new Map<string, string>();

async function ensureCommittedPriceId(): Promise<string> {
  const cached = committedPriceCache.get("committed");
  if (cached) return cached;

  const lookupKey = "api_usage_committed_monthly";
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    committedPriceCache.set("committed", existing.data[0].id);
    return existing.data[0].id;
  }

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: Math.round(COMMITTED_PLAN_FLAT_PRICE * 100),
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    product_data: { name: "API usage — committed plan" },
  });
  committedPriceCache.set("committed", price.id);
  return price.id;
}

export async function resolveAppPayerUserId(app: { ownerUserId: string | null; ownerBusinessId: string | null }): Promise<string | null> {
  if (app.ownerUserId) return app.ownerUserId;
  if (app.ownerBusinessId) {
    const owner = await db.businessMember.findFirst({ where: { businessId: app.ownerBusinessId, role: "owner" }, select: { userId: true } });
    return owner?.userId ?? null;
  }
  return null;
}

// Starts a real Stripe subscription Checkout for a DeveloperApp moving off
// "free" — a hosted redirect can't confirm subscription creation
// synchronously, so billingPlan/apiSubscriptionId are only ever set by
// activateApiPlanSubscription below, once the webhook confirms
// checkout.session.completed. Neither plan needs quantity on its line item
// (metered prices reject it outright; the flat committed price is a fixed
// per-period charge, not per-unit).
export async function createApiPlanCheckoutSession(params: {
  appId: string;
  plan: "pay_as_you_go" | "committed";
  payerUserId: string;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string }> {
  const priceId = params.plan === "committed" ? await ensureCommittedPriceId() : await ensureOveragePriceId();
  const customerId = await getOrCreateStripeCustomerId(params.payerUserId, params.payerEmail);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: params.plan === "committed" ? 1 : undefined }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      kind: "api_usage_plan",
      appId: params.appId,
      plan: params.plan,
      payerUserId: params.payerUserId,
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { checkoutUrl: session.url };
}

// Called from the Stripe webhook on checkout.session.completed once a
// pay_as_you_go/committed subscription is confirmed.
export async function activateApiPlanSubscription(metadata: Record<string, string>, processorSubscriptionId: string): Promise<void> {
  const { appId, plan } = metadata;
  const app = await db.developerApp.findUnique({ where: { id: appId } });
  if (!app || app.apiSubscriptionId === processorSubscriptionId) return; // already activated (Stripe redelivery) or app no longer exists

  await db.developerApp.update({
    where: { id: appId },
    data: { billingPlan: plan, apiSubscriptionId: processorSubscriptionId, lastBilledAt: new Date() },
  });
}

// Moving back to "free" (or off a plan entirely) cancels the real Stripe
// subscription — called from the billing-plan action, mirrors
// cancelPlatformSubscription/memberships.ts's cancelSubscription ordering:
// Stripe first, local row second, so a failed Stripe call can't leave the
// app marked "free" while Stripe keeps billing it.
export async function downgradeApiPlanToFree(appId: string): Promise<void> {
  const app = await db.developerApp.findUnique({ where: { id: appId } });
  if (!app?.apiSubscriptionId) {
    await db.developerApp.update({ where: { id: appId }, data: { billingPlan: "free" } });
    return;
  }
  await stripe.subscriptions.cancel(app.apiSubscriptionId);
  await db.developerApp.update({ where: { id: appId }, data: { billingPlan: "free", apiSubscriptionId: null } });
}

// Called from the Stripe webhook on invoice.paid — the real "charge
// succeeded" signal for a subscription's committed flat fee or a period's
// metered overage, replacing what used to be settleAppUsage's own direct
// stub charge. Idempotent on processorReference (the invoice id).
export async function recordApiUsageInvoicePaid(params: {
  processorSubscriptionId: string;
  amount: number;
  currency: string;
  processorReference: string;
}): Promise<void> {
  const already = await db.paymentTransaction.findFirst({ where: { processorReference: params.processorReference, kind: "api_usage_charge" } });
  if (already) return;
  if (params.amount <= 0) return; // a $0 metered invoice (no overage this period) still fires invoice.paid — nothing to record

  const app = await db.developerApp.findFirst({ where: { apiSubscriptionId: params.processorSubscriptionId } });
  if (!app) return; // not one of ours (or a plan/platform subscription's own invoice, handled elsewhere)

  const payerId = await resolveAppPayerUserId(app);
  if (!payerId) return;

  await db.$transaction(async (tx) => {
    await recordPaymentTransaction(tx, {
      kind: "api_usage_charge",
      payerId,
      payeeId: null,
      amount: params.amount,
      currency: params.currency,
      processorReference: params.processorReference,
      status: "succeeded",
      relatedObjectType: "developer_app",
      relatedObjectId: app.id,
    });
  });
}

// Reports one pay_as_you_go app's overage since its lastBilledAt (or
// creation, on the first run) as a single Meter Event — Stripe aggregates
// reported events and bills automatically at the subscription's own
// billing-cycle boundary (invoice.paid, above, is what records the
// ledger). Committed apps need nothing here: their flat fee bills
// automatically off the subscription itself, no usage-dependent action.
// advances lastBilledAt regardless, same "watermark moves even on a
// zero-usage period" reasoning the old stub sweep already established.
export async function settleAppUsage(appId: string): Promise<void> {
  const app = await db.developerApp.findUniqueOrThrow({ where: { id: appId } });
  if (app.billingPlan !== "pay_as_you_go" || !app.apiSubscriptionId) return;

  const periodStart = app.lastBilledAt ?? app.createdAt;
  const now = new Date();

  const usage = await db.apiUsageCounter.aggregate({
    where: { appId: app.id, windowStart: { gte: periodStart, lt: now } },
    _sum: { requestCount: true },
  });
  const totalRequests = usage._sum.requestCount ?? 0;
  const overage = Math.max(0, totalRequests - INCLUDED_FREE_REQUESTS_PER_PERIOD);

  if (overage > 0) {
    const customer = await stripe.subscriptions.retrieve(app.apiSubscriptionId, { expand: ["customer"] });
    const customerId = typeof customer.customer === "string" ? customer.customer : customer.customer.id;
    await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: { stripe_customer_id: customerId, value: String(overage) },
    });
  }

  await db.developerApp.update({ where: { id: app.id }, data: { lastBilledAt: now } });
}

async function sweepDueSettlements(): Promise<void> {
  const due = await db.developerApp.findMany({
    where: {
      billingPlan: "pay_as_you_go",
      apiSubscriptionId: { not: null },
      OR: [{ lastBilledAt: null }, { lastBilledAt: { lt: new Date(Date.now() - BILLING_PERIOD_MS) } }],
    },
    select: { id: true },
  });
  for (const { id } of due) await settleAppUsage(id);
}

const SETTLEMENT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // periods are month-long — checking a few times a day is plenty

const globalForApiUsageBilling = globalThis as unknown as { apiUsageBillingSchedulerStarted?: boolean };

export function startApiUsageBillingScheduler(): void {
  if (globalForApiUsageBilling.apiUsageBillingSchedulerStarted) return;
  globalForApiUsageBilling.apiUsageBillingSchedulerStarted = true;

  const tick = () => void sweepDueSettlements();
  tick();
  setInterval(tick, SETTLEMENT_CHECK_INTERVAL_MS);
}
