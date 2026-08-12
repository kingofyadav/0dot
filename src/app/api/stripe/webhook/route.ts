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
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};
      const kind = metadata.kind;

      if (session.mode === "payment" && kind && ONE_TIME_ACTIVATORS[kind]) {
        await ONE_TIME_ACTIVATORS[kind](metadata, session.id);
        break;
      }

      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
        if (!currentPeriodEndSeconds) break;
        const currentPeriodEnd = new Date(currentPeriodEndSeconds * 1000);

        if (kind === "platform_subscription") {
          const { subscriberType, subscriberId, payerUserId, plan, billingInterval } = metadata;
          if (!subscriberType || !subscriberId || !payerUserId || !plan || !billingInterval) break;
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
        }
      }
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
      // which don't carry back our Checkout Session metadata.
      await syncSubscriptionFromStripe(subscription.id, subscription.status, currentPeriodEnd);
      await syncMembershipFromStripe(subscription.id, subscription.status, currentPeriodEnd);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
