import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import type { PayoutAccountStatus } from "@/lib/payments";

// Separate endpoint from /api/stripe/webhook on purpose: that route
// consumes classic v1 Events (`stripe.webhooks.constructEventAsync`,
// snapshot payloads) — Accounts v2 capability-status changes are only
// delivered as v2 "thin" Events, a genuinely different delivery mechanism
// (own Event Destination, own signing secret, own SDK verification method
// — `stripe.parseEventNotificationAsync`, not `constructEventAsync`) per
// https://docs.stripe.com/event-destinations#thin-events. Mixing the two
// payload shapes on one route isn't supported.
//
// This is the fix for the critical "no creator can ever get paid" gap:
// createPayoutAccount (src/lib/payments.ts) always writes
// CreatorPayoutAccount.status: "onboarding" and nothing previously ever
// advanced it — every tip/membership/course/etc. purchase gate
// (`payoutAccount.status !== "active"`) was permanently closed even after
// a creator finished Stripe onboarding for real.
//
// Deployment step still required (deliberately not done by this change —
// it's a live-Stripe-account configuration action, not app code): create a
// v2 Event Destination of type "webhook_endpoint" with
// event_payload: "thin", pointed at this route's deployed URL, subscribed
// to at least "v2.core.account[configuration.recipient].capability_status_updated"
// (Dashboard: Workbench → Webhooks → Add destination → toggle "Use thin
// events"; or POST /v2/core/event_destinations). Store its signing secret
// as STRIPE_THIN_WEBHOOK_SECRET — this route refuses to process events
// without it, same posture as the existing route's STRIPE_WEBHOOK_SECRET.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_THIN_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const body = await req.text();
  let notification: Awaited<ReturnType<typeof stripe.parseEventNotificationAsync>>;
  try {
    notification = await stripe.parseEventNotificationAsync(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // The specific recipient-capability event is the precise signal (fires
  // only when stripe_balance.stripe_transfers actually changes status);
  // the broader account.updated is handled too as a safety net in case the
  // Event Destination ends up subscribed more broadly than the narrow
  // event above — both branches converge on the same re-check-and-sync
  // logic rather than trusting either payload's own fields, since a
  // capability can change again between the event firing and this handler
  // running.
  if (
    notification.type === "v2.core.account[configuration.recipient].capability_status_updated" ||
    notification.type === "v2.core.account.updated"
  ) {
    const account = await notification.fetchRelatedObject();
    await syncPayoutAccountStatus(account.id, account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status);
  }

  return NextResponse.json({ received: true });
}

const CAPABILITY_STATUS_TO_PAYOUT_STATUS: Record<string, PayoutAccountStatus> = {
  active: "active",
  pending: "onboarding",
  restricted: "restricted",
  unsupported: "restricted",
};

async function syncPayoutAccountStatus(processorAccountId: string, capabilityStatus: string | undefined): Promise<void> {
  const status = capabilityStatus ? CAPABILITY_STATUS_TO_PAYOUT_STATUS[capabilityStatus] : undefined;
  if (!status) return; // no stripe_balance.stripe_transfers capability on this account (yet, or ever) — nothing to sync

  await db.creatorPayoutAccount.updateMany({
    where: { processorAccountId },
    data: { status },
  });
}
