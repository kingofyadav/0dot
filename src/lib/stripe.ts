import "server-only";
import Stripe from "stripe";
import { db } from "@/lib/db";

function requireSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

// platform-billing addendum §2.2's SubscriptionProcessor talks to this —
// "instantiate a client and call methods on it" (never the deprecated
// global-key style).
//
// Constructed lazily behind a Proxy: importing this module must never
// require STRIPE_SECRET_KEY, only actually *calling* Stripe does. `next
// build` collects page data by evaluating every route module — including
// ones that transitively import this — and a build must not depend on a
// production secret being present (it's why preview builds failed). Same
// lazy posture as getEmailSender / getAIProvider / getLivestreamProvider;
// requireSecretKey() still throws loudly, now on first real use.
let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(requireSecretKey());
  return stripeClient;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getStripe(), prop, receiver);
    return typeof value === "function" ? value.bind(getStripe()) : value;
  },
});

// Cached on User.stripeCustomerId so a payer reuses one Stripe Customer
// across every checkout (premium profile, business subscription) instead
// of Stripe minting a new one per session.
export async function getOrCreateStripeCustomerId(userId: string, email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({ email, metadata: { userId } });
  await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}
