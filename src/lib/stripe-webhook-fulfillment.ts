import "server-only";
import type Stripe from "stripe";

// The fulfillment-gating decision for a checkout.session.completed /
// checkout.session.async_payment_succeeded event, split out of
// src/app/api/stripe/webhook/route.ts's handleCheckoutSession so it can be
// unit-tested without constructing a Stripe event or mocking every
// activ:XXX module. The route still owns the activator dispatch table and
// the (network) subscription retrieve — this only classifies.

// Subscription-mode Checkout can hand back a session whose subscription
// isn't paying yet — a delayed-notification payment method (ACH, SEPA,
// Bacs, iDEAL, boleto, Konbini, "Pay by Bank", …) leaves it "incomplete"
// at checkout.session.completed time and only advances to "active" once
// the bank confirms (a later async_payment_succeeded /
// customer.subscription.updated). Only these two statuses mean "grant
// access now".
export const FULFILLABLE_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
]);

export function isFulfillableSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return FULFILLABLE_SUBSCRIPTION_STATUSES.has(status);
}

export type CheckoutClassification =
  // mode:"payment", paid, kind maps to a ONE_TIME_ACTIVATORS entry
  | { action: "one-time"; activatorKey: string }
  // mode:"subscription", kind is one we maintain a local row for
  | { action: "subscription"; subscriptionKind: "platform_subscription" | "membership" | "api_usage_plan" }
  // valid session, just not payable yet — wait for a later event
  | { action: "defer"; reason: string }
  // nothing to do (unknown kind, missing ref, unhandled mode)
  | { action: "ignore"; reason: string };

// `knownOneTimeKinds` is ONE_TIME_ACTIVATORS' key set, passed in so the
// route stays the single source of truth for which one-time kinds exist.
export function classifyCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "mode" | "metadata" | "payment_status" | "subscription">,
  knownOneTimeKinds: ReadonlySet<string>,
): CheckoutClassification {
  const kind = session.metadata?.kind;

  if (session.mode === "payment") {
    if (!kind || !knownOneTimeKinds.has(kind)) {
      return { action: "ignore", reason: `payment-mode session, unrecognized kind ${JSON.stringify(kind ?? null)}` };
    }
    // "unpaid" is the only non-fulfillable value — "paid" and
    // "no_payment_required" both mean the money is (or never needed to be)
    // in. Stripe's own fulfillment guidance is this exact check, not
    // "trust checkout.session.completed".
    if (session.payment_status === "unpaid") {
      return { action: "defer", reason: "payment_status=unpaid — awaiting checkout.session.async_payment_succeeded" };
    }
    return { action: "one-time", activatorKey: kind };
  }

  if (session.mode === "subscription") {
    if (!session.subscription) {
      return { action: "ignore", reason: "subscription-mode session with no subscription reference" };
    }
    if (kind === "platform_subscription" || kind === "membership" || kind === "api_usage_plan") {
      return { action: "subscription", subscriptionKind: kind };
    }
    return { action: "ignore", reason: `subscription-mode session, unrecognized kind ${JSON.stringify(kind ?? null)}` };
  }

  return { action: "ignore", reason: `unhandled checkout mode ${JSON.stringify(session.mode)}` };
}
