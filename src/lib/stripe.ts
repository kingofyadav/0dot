import "server-only";
import Stripe from "stripe";
import { db } from "@/lib/db";

function requireSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

// platform-billing addendum §2.2's SubscriptionProcessor talks to this —
// one instance per module load, matching the "instantiate a client and
// call methods on it" pattern (never the deprecated global-key style).
export const stripe = new Stripe(requireSecretKey());

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
