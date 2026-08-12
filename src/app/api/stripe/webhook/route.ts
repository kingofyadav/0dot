import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { activateSubscriptionFromCheckout, syncSubscriptionFromStripe } from "@/lib/platform-billing";

// Real counterpart to the SubscriptionProcessor stub this addendum used to
// carry — Stripe Checkout confirms payment asynchronously, so this webhook
// (not the checkout-starting server action) is what actually creates and
// maintains PlatformSubscription rows. Signature verification per the
// stripe-best-practices skill's security reference: never process a
// webhook body before constructEvent confirms it's genuinely from Stripe.
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
      if (session.mode !== "subscription" || !session.subscription) break;

      const metadata = session.metadata ?? {};
      const { subscriberType, subscriberId, payerUserId, plan, billingInterval } = metadata;
      if (!subscriberType || !subscriberId || !payerUserId || !plan || !billingInterval) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
      if (!currentPeriodEndSeconds) break;

      await activateSubscriptionFromCheckout({
        subscriberType: subscriberType as "profile" | "business",
        subscriberId,
        payerUserId,
        plan,
        billingInterval,
        processorSubscriptionId: subscription.id,
        currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency ?? "usd",
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
      if (!currentPeriodEndSeconds) break;

      await syncSubscriptionFromStripe(subscription.id, subscription.status, new Date(currentPeriodEndSeconds * 1000));
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
