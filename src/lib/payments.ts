import "server-only";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { stripe, getOrCreateStripeCustomerId } from "@/lib/stripe";

// A double-click or network retry on a "Tip"/"Buy" button re-runs the whole
// server action, which would otherwise mint a second, distinct Checkout
// Session (and a second charge) for what the user experienced as one click.
// Hashing the exact purchase intent gives Stripe a stable key: a retry
// within its 24h idempotency window replays the original session instead of
// creating a new one. Deliberately excludes nothing time-varying (no
// timestamp/nonce in the input) — two genuinely different purchases with
// identical params are rare enough (and inconsequential enough, since a
// legitimate repeat click is exactly what this should collapse) not to need
// a nonce that would defeat the dedup entirely.
function checkoutIdempotencyKey(parts: Record<string, unknown>): string {
  return `checkout_${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

// phase-5 build plan §0 / spec §3.2: no finance decision on fee rates
// exists yet, so this is a single flat placeholder applied to every
// PaymentTransaction kind rather than per-kind rates (spec §14 flags rates
// could differ by feature — deferred until finance actually decides).
// Captured per-row at transaction time (recordPaymentTransaction below), so
// changing this constant later never rewrites the story of a past
// transaction.
export const PLATFORM_FEE_PERCENT = 0.1;

// premium-profiles addendum §3.6/§7: a reduced fee for creators who are
// themselves an active profile_premium subscriber — exact rate is a
// finance decision the addendum flags as unconfirmed, so this is a
// placeholder in the same spirit as PLATFORM_FEE_PERCENT above, not a real
// number to build pricing commitments on.
export const PREMIUM_CREATOR_PLATFORM_FEE_PERCENT = 0.07;

// Accounts v2 requires identity.country before it will let a create call
// request the recipient configuration's stripe_transfers capability — see
// the "identity_country_required" Stripe error. Nothing in the schema
// (User, Business) collects a country today, and the platform is India-only
// at launch, so this is a deliberate single-country placeholder rather than
// a guess derived from e.g. phone dial code (ambiguous: +1 is both US and
// CA). Revisit as a real per-account field the day payouts expand beyond
// India.
const PAYOUT_ACCOUNT_COUNTRY = "IN";

export type PayoutAccountStatus = "onboarding" | "active" | "restricted";

// spec §3: every feature that moves money (tips, memberships, digital
// downloads, courses, affiliate commissions, tickets, marketplace, donations,
// offerings) goes through this interface, never talks to a processor SDK
// directly. Now backed by real Stripe Connect (Accounts v2, per the
// stripe-best-practices skill's connect reference — never the deprecated
// v1 `type: 'express'`/`'custom'`/`'standard'` account shapes) instead of a
// stub. A hosted Checkout redirect is inherently async, so — same shape as
// platform-billing.ts's SubscriptionProcessor — charging returns a URL to
// redirect to, not a synchronous succeeded/failed result; the caller's own
// feature row is created by the Stripe webhook once payment is confirmed,
// via each feature file's own exported `activateXxx` function.
export interface PaymentProcessor {
  readonly name: string;
  createPayoutAccount(entity: { id: string; email: string }): Promise<{
    processorAccountId: string;
    status: PayoutAccountStatus;
  }>;
  // Stripe-hosted flow that collects the identity/bank info the v2 Account
  // needs before its stripe_transfers capability can go active — a
  // recipient-configuration Account isn't payable-to until this completes.
  createOnboardingLink(processorAccountId: string, params: { returnUrl: string; refreshUrl: string }): Promise<{ url: string }>;
  // One-time destination charge (tips, donations, digital/course/offering/
  // ticket/marketplace purchases): buyer pays via Checkout, funds transfer
  // to the payee's connected account minus applicationFeeAmount on success.
  createPurchaseCheckoutSession(params: {
    amount: number;
    currency: string;
    payerId: string;
    payerEmail: string;
    payeeProcessorAccountId: string;
    applicationFeeAmount: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string }>;
  // Recurring destination charge (memberships): same shape, but a Connect
  // subscription takes a fee *percent* (subscription_data.
  // application_fee_percent), not a fixed amount, since the charged amount
  // repeats every period.
  createSubscriptionCheckoutSession(params: {
    amount: number;
    currency: string;
    billingInterval: string;
    payerId: string;
    payerEmail: string;
    payeeProcessorAccountId: string;
    applicationFeePercent: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string }>;
  cancelSubscription(processorSubscriptionId: string): Promise<void>;
}

// Marketplace business model per the stripe-best-practices skill's connect
// reference table: platform owns checkout (`dashboard: "express"`),
// platform owns pricing and negative-balance liability (`fees_collector`/
// `losses_collector: "application"`), Destination charges. Recipient
// configuration only (not merchant) — connected accounts never become
// merchant of record here, they only receive transfers.
class StripeConnectPaymentProcessor implements PaymentProcessor {
  readonly name = "stripe_connect";

  async createPayoutAccount(entity: { id: string; email: string }) {
    const account = await stripe.v2.core.accounts.create({
      contact_email: entity.email,
      dashboard: "express",
      identity: { country: PAYOUT_ACCOUNT_COUNTRY },
      defaults: {
        responsibilities: { fees_collector: "application", losses_collector: "application" },
      },
      configuration: {
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
        },
      },
      include: ["configuration.recipient"],
    });
    return { processorAccountId: account.id, status: "onboarding" as const };
  }

  async createOnboardingLink(processorAccountId: string, params: { returnUrl: string; refreshUrl: string }) {
    const link = await stripe.v2.core.accountLinks.create({
      account: processorAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          return_url: params.returnUrl,
          refresh_url: params.refreshUrl,
        },
      },
    });
    return { url: link.url };
  }

  async createPurchaseCheckoutSession(params: {
    amount: number;
    currency: string;
    payerId: string;
    payerEmail: string;
    payeeProcessorAccountId: string;
    applicationFeeAmount: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string }> {
    const customerId = await getOrCreateStripeCustomerId(params.payerId, params.payerEmail);
    const idempotencyKey = checkoutIdempotencyKey({ mode: "payment", customerId, ...params });
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: params.currency,
              unit_amount: Math.round(params.amount * 100),
              product_data: { name: params.description },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: Math.round(params.applicationFeeAmount * 100),
          transfer_data: { destination: params.payeeProcessorAccountId },
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      },
      { idempotencyKey }
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url };
  }

  async createSubscriptionCheckoutSession(params: {
    amount: number;
    currency: string;
    billingInterval: string;
    payerId: string;
    payerEmail: string;
    payeeProcessorAccountId: string;
    applicationFeePercent: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string }> {
    const customerId = await getOrCreateStripeCustomerId(params.payerId, params.payerEmail);
    const idempotencyKey = checkoutIdempotencyKey({ mode: "subscription", customerId, ...params });
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: params.currency,
              unit_amount: Math.round(params.amount * 100),
              recurring: { interval: params.billingInterval === "yearly" ? "year" : "month" },
              product_data: { name: params.description },
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          application_fee_percent: Math.round(params.applicationFeePercent * 10000) / 100,
          transfer_data: { destination: params.payeeProcessorAccountId },
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      },
      { idempotencyKey }
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url };
  }

  async cancelSubscription(processorSubscriptionId: string): Promise<void> {
    await stripe.subscriptions.update(processorSubscriptionId, { cancel_at_period_end: true });
  }
}

const processor: PaymentProcessor = new StripeConnectPaymentProcessor();

export function getPaymentProcessor(): PaymentProcessor {
  return processor;
}

// Shared by recordPaymentTransaction below and every feature action that
// needs to know the fee *before* charging (Stripe needs
// applicationFeeAmount/applicationFeePercent at charge time, not after) —
// factored out so both call sites can never compute a different rate for
// the same payee. Takes a client (plain `db`, or a `tx` from an in-flight
// transaction) rather than importing one, so recordPaymentTransaction can
// keep its existing atomicity — the discount check and the ledger write
// stay against the same transaction client.
export async function resolveFeeRate(
  client: Pick<Prisma.TransactionClient, "platformSubscription">,
  payeeId: string | null | undefined
): Promise<number> {
  if (!payeeId) return PLATFORM_FEE_PERCENT;
  const premiumPayee = await client.platformSubscription.findFirst({
    where: {
      plan: "profile_premium",
      subscriberProfile: { userId: payeeId },
      OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return premiumPayee ? PREMIUM_CREATOR_PLATFORM_FEE_PERCENT : PLATFORM_FEE_PERCENT;
}

export function getMyPayoutAccount(userId: string) {
  return db.creatorPayoutAccount.findUnique({ where: { userId } });
}

// phase-8 spec §5.2: business-hosted paid events need a payout account too
// — same shape as getMyPayoutAccount, keyed on businessId instead of userId.
export function getBusinessPayoutAccount(businessId: string) {
  return db.creatorPayoutAccount.findUnique({ where: { businessId } });
}

// spec §3.5's "every kind produces exactly one PaymentTransaction row with
// a non-null platform_fee and processor_reference" criterion is enforced by
// funneling every money-moving feature through this one function, not by
// convention. Runs inside the caller's transaction so the ledger write and
// the feature's own row (Tip, later MembershipSubscription, etc.) can never
// drift apart.
// phase-8 build plan §5: payeeId/payeeBusinessId — exactly one set, mutual
// exclusivity enforced by the caller (purchaseTicket, events.ts), not here.
// Every pre-phase-8 caller (tip/digital/course/affiliate) keeps passing
// payeeId only, unaffected.
// phase-15 spec §6.2: processor/storeFee default to the pre-existing
// behavior (stripe_connect, no store cut) so every pre-phase-15 call site
// (tip/digital/course/affiliate/ticket/business/marketplace) is unaffected
// — only a native app's in-app-purchase flow passes apple_iap/
// google_play_billing and a storeFee, per §6.1's store-policy requirement.
export async function recordPaymentTransaction(
  tx: Prisma.TransactionClient,
  params: {
    kind: string;
    payerId: string | null;
    payeeId?: string | null;
    payeeBusinessId?: string | null;
    amount: number;
    currency: string;
    processorReference: string;
    status: "pending" | "succeeded" | "failed" | "refunded";
    relatedObjectType?: string;
    relatedObjectId?: string;
    processor?: "stripe_connect" | "apple_iap" | "google_play_billing";
    storeFee?: number;
  }
) {
  // premium-profiles addendum §3.6: resolveFeeRate runs against `tx`, the
  // same transaction client the ledger write below uses, so the discount
  // check and the write stay atomic with each other.
  const feeRate = await resolveFeeRate(tx, params.payeeId);
  // billing addendum §2.1: the one case in this ledger with genuinely no
  // payee — platform_subscription_charge/api_usage_charge rows (payeeId
  // and payeeBusinessId both null) — money flows straight to 0dot, so
  // platform_fee is the *full* charged amount, not the facilitator-model
  // rate above. An honest semantic mismatch the addendum names explicitly
  // rather than something to paper over.
  const platformFee = !params.payeeId && !params.payeeBusinessId ? params.amount : Math.round(params.amount * feeRate * 100) / 100;
  return tx.paymentTransaction.create({
    data: {
      kind: params.kind,
      payerId: params.payerId,
      payeeId: params.payeeId ?? null,
      payeeBusinessId: params.payeeBusinessId ?? null,
      amount: params.amount,
      currency: params.currency,
      platformFee,
      processor: params.processor ?? "stripe_connect",
      storeFee: params.storeFee ?? null,
      processorReference: params.processorReference,
      status: params.status,
      relatedObjectType: params.relatedObjectType,
      relatedObjectId: params.relatedObjectId,
    },
  });
}

// phase-15 spec §6.3: records the aggregated lump-sum store payout, then
// attributes it against the per-creator PaymentTransaction rows it covers
// — the reconciliation step Apple/Google's payout topology requires that
// Stripe Connect's direct-to-creator model never needed. Flagged in the
// spec as needing dedicated finance/ops work; this is the schema-level
// mechanism that work would build on, not a complete reconciliation engine.
export async function recordIapPayoutBatch(params: {
  processor: "apple_iap" | "google_play_billing";
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return db.iapPayoutBatch.create({
    data: {
      processor: params.processor,
      amount: params.amount,
      currency: params.currency,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    },
  });
}

// Attributes every succeeded, not-yet-reconciled PaymentTransaction for a
// processor within the batch's period to that batch, then marks it
// reconciled — the "before disbursement" step spec §6.4's acceptance
// criterion requires happen prior to paying creators out through their
// CreatorPayoutAccount.
export async function reconcileIapPayoutBatch(batchId: string): Promise<number> {
  const batch = await db.iapPayoutBatch.findUniqueOrThrow({ where: { id: batchId } });
  const { count } = await db.paymentTransaction.updateMany({
    where: {
      processor: batch.processor,
      status: "succeeded",
      iapPayoutBatchId: null,
      createdAt: { gte: batch.periodStart, lte: batch.periodEnd },
    },
    data: { iapPayoutBatchId: batchId },
  });
  await db.iapPayoutBatch.update({ where: { id: batchId }, data: { status: "reconciled" } });
  return count;
}
