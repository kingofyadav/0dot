import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { activateSubscriptionFromCheckout, syncSubscriptionFromStripe } from "@/lib/platform-billing";
import { activateTip } from "@/app/actions/tips";
import { activateDonation } from "@/app/actions/donations";
import { activateDigitalPurchase } from "@/app/actions/digital-products";
import { activateCoursePurchase } from "@/app/actions/courses";
import { activateOfferingPurchase } from "@/app/actions/offerings";
import { activateTicketPurchase } from "@/app/actions/events";
import { activateMarketplacePurchase } from "@/app/actions/marketplace";
import { activateMembershipSubscription, syncMembershipFromStripe } from "@/app/actions/memberships";
import { activateApiPlanSubscription, recordApiUsageInvoicePaid } from "@/lib/api-usage-billing";

// One-time (mode: "payment") destination-charge purchases, keyed by the
// metadata.kind every createPurchaseCheckoutSession caller sets — each
// feature file owns its own activation function (recordPaymentTransaction
// + its feature row + side effects), this route only dispatches.
const ONE_TIME_ACTIVATORS: Record<string, (metadata: Record<string, string>, processorReference: string) => Promise<void>> = {
  tip: activateTip,
  donation: activateDonation,
  digital_purchase: activateDigitalPurchase,
  course_purchase: activateCoursePurchase,
  offering_purchase: activateOfferingPurchase,
  ticket_purchase: activateTicketPurchase,
  marketplace_purchase: activateMarketplacePurchase,
};

// Subscription-mode Checkout can hand back a session whose subscription
// isn't actually paying yet — a delayed-notification payment method (ACH,
// SEPA, Bacs, iDEAL, boleto, Konbini, "Pay by Bank", …, all selectable
// because the Checkout sessions deliberately don't pin payment_method_types)
// leaves the subscription "incomplete" at checkout.session.completed time
// and only advances to "active" once the bank confirms, which arrives as a
// second checkout.session.async_payment_succeeded event. Only these two
// statuses mean "grant access now"; anything else waits for that later
// event (or customer.subscription.updated) to re-drive activation.
const FULFILLABLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

// Everything downstream of checkout.session.completed /
// .async_payment_succeeded — split out because those two events are the
// same fulfillment path: for an instant payment method the first one
// already carries payment_status "paid"; for a delayed one the first
// arrives "unpaid" (nothing is granted) and the second arrives "paid"
// once the funds clear. Routing both here means a slow bank transfer
// fulfills exactly once, when it actually settles, with no separate
// code path.
async function handleCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata ?? {};
  const kind = metadata.kind;

  if (session.mode === "payment" && kind && ONE_TIME_ACTIVATORS[kind]) {
    // "unpaid" is the only non-fulfillable value here — "paid" and
    // "no_payment_required" both mean the money is (or never needed to be)
    // in. Stripe's own fulfillment guidance is this exact check, not
    // "trust checkout.session.completed."
    if (session.payment_status === "unpaid") {
      console.log(`stripe webhook: ${kind} checkout ${session.id} completed but payment_status=unpaid — deferring to async_payment_succeeded.`);
      return;
    }
    await ONE_TIME_ACTIVATORS[kind](metadata, session.id);
    return;
  }

  if (session.mode === "subscription" && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
    if (!currentPeriodEndSeconds) return;
    const currentPeriodEnd = new Date(currentPeriodEndSeconds * 1000);

    if (!FULFILLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      console.log(`stripe webhook: subscription ${subscription.id} for checkout ${session.id} is "${subscription.status}" — deferring activation until it clears.`);
      return;
    }

    if (kind === "platform_subscription") {
      const { subscriberType, subscriberId, payerUserId, plan, billingInterval } = metadata;
      if (!subscriberType || !subscriberId || !payerUserId || !plan || !billingInterval) return;
      await activateSubscriptionFromCheckout({
        subscriberType: subscriberType as "profile" | "business",
        subscriberId,
        payerUserId,
        plan,
        billingInterval,
        processorSubscriptionId: subscription.id,
        currentPeriodEnd,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency ?? "usd",
      });
    } else if (kind === "membership") {
      await activateMembershipSubscription({ metadata, processorSubscriptionId: subscription.id, currentPeriodEnd });
    } else if (kind === "api_usage_plan") {
      await activateApiPlanSubscription(metadata, subscription.id);
    }
  }
}

// Real counterpart to the SubscriptionProcessor/PaymentProcessor stubs this
// addendum used to carry — Stripe Checkout confirms payment
// asynchronously, so this webhook (not the checkout-starting server
// actions) is what actually creates and maintains PlatformSubscription,
// MembershipSubscription, and every one-time purchase's feature row.
// Signature verification per the stripe-best-practices skill's security
// reference: never process a webhook body before constructEvent confirms
// it's genuinely from Stripe.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  switch (event.type) {
    // Instant payment methods land here already "paid"; delayed ones land
    // here "unpaid" and come back as async_payment_succeeded once settled.
    // Both route through the same handler, which gates on payment_status /
    // subscription status so fulfillment happens exactly once, at
    // settlement.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Nothing was ever granted (the "unpaid" branch above returned early),
      // so there's nothing to unwind — just leave a trail.
      console.warn(`stripe webhook: delayed payment failed for checkout ${session.id} (kind=${session.metadata?.kind ?? "?"}) — no fulfillment occurred.`);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
      if (!currentPeriodEndSeconds) break;
      const currentPeriodEnd = new Date(currentPeriodEndSeconds * 1000);

      // Each sync function looks up its own table by processorSubscriptionId
      // and no-ops if not found — safe to call both rather than threading a
      // kind discriminator through Stripe's own subscription webhooks,
      // which don't carry back our Checkout Session metadata. DeveloperApp
      // has no equivalent sync need — api-usage-billing.ts's plan doesn't
      // track a local currentPeriodEnd, Stripe's own invoicing is the only
      // thing that cares.
      await syncSubscriptionFromStripe(subscription.id, subscription.status, currentPeriodEnd);
      await syncMembershipFromStripe(subscription.id, subscription.status, currentPeriodEnd);
      break;
    }
    // billing addendum §4: the real "charge succeeded" signal for
    // api-usage-billing.ts's committed flat fee and metered overage —
    // Stripe generates and collects these invoices automatically off the
    // subscription created above, this route only ever records the ledger
    // once payment is confirmed.
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef =
        invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details?.subscription : null;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) break;

      await recordApiUsageInvoicePaid({
        processorSubscriptionId: subscriptionId,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        processorReference: invoice.id ?? `${subscriptionId}_${invoice.created}`,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
