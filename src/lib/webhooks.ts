import "server-only";
import { createHmac, randomBytes } from "crypto";
import { db } from "@/lib/db";

// spec §7.1: webhooks expose the existing Notification.type/subjectType
// catalog externally rather than a second event vocabulary — this map is
// the only new thing, translating a subset of that catalog to the OAuth
// scope (spec §7.2) a user must have granted the app before it can receive
// that event about them. Deliberately partial: a Notification.type with no
// entry here simply never fires a webhook, which is the correct behavior
// for types this phase's scope catalog (oauth.ts) doesn't cover yet, not a
// bug to fix by inventing a scope for everything.
const EVENT_SCOPE_MAP: Record<string, string> = {
  like: "posts:read",
  comment: "posts:read",
  mention: "posts:read",
  new_follower: "profile:read",
  message: "messages:read",
  tip_received: "payments:read",
  affiliate_conversion: "payments:read",
  new_subscriber: "marketplace:read",
  appointment_request: "marketplace:read",
  appointment_confirmed: "marketplace:read",
  appointment_cancelled: "marketplace:read",
  event_cancelled: "events:read",
};

export const ALLOWED_WEBHOOK_EVENT_TYPES = Object.keys(EVENT_SCOPE_MAP);

const FAILURE_THRESHOLD = 10;

export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

// Called from notifications.ts's createNotification, after the
// Notification row is written — best-effort, synchronous single delivery
// attempt (this codebase has no background job runner; see payments.ts's
// stub processor for the same "synchronous stand-in for what would be
// async infra" posture elsewhere). Never throws: a webhook target being
// down must not break the in-app notification it's mirroring.
export async function dispatchWebhookEvent(args: { recipientId: string; type: string; subjectType: string; subjectId: string }): Promise<void> {
  const requiredScope = EVENT_SCOPE_MAP[args.type];
  if (!requiredScope) return;

  try {
    const authorizations = await db.oAuthAuthorization.findMany({
      where: { userId: args.recipientId, status: "active" },
      include: { app: { include: { webhookSubscriptions: { where: { status: "active" } } } } },
    });

    const payload = JSON.stringify({
      type: args.type,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      userId: args.recipientId,
      createdAt: new Date().toISOString(),
    });

    for (const authorization of authorizations) {
      const scopes: string[] = JSON.parse(authorization.grantedScopesJson);
      if (!scopes.includes(requiredScope)) continue;

      for (const subscription of authorization.app.webhookSubscriptions) {
        const eventTypes: string[] = JSON.parse(subscription.eventTypesJson);
        if (!eventTypes.includes(args.type)) continue;
        await deliverWebhook(subscription, args.type, payload);
      }
    }
  } catch {
    // Best-effort — a malformed subscription or a DB hiccup here must never
    // surface to the caller that's just trying to write a Notification.
  }
}

async function deliverWebhook(subscription: { id: string; targetUrl: string; secret: string; failureCount: number; appId: string }, eventType: string, payload: string): Promise<void> {
  const delivery = await db.webhookDelivery.create({
    data: { subscriptionId: subscription.id, eventType, payload, status: "pending", attemptCount: 1, lastAttemptedAt: new Date() },
  });

  let delivered = false;
  try {
    const response = await fetch(subscription.targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-0dot-Signature": signWebhookPayload(subscription.secret, payload) },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }

  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: delivered ? { status: "delivered" } : { status: "failed", nextRetryAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  if (delivered) {
    if (subscription.failureCount > 0) {
      await db.webhookSubscription.update({ where: { id: subscription.id }, data: { failureCount: 0 } });
    }
    return;
  }

  const failureCount = subscription.failureCount + 1;
  if (failureCount >= FAILURE_THRESHOLD) {
    await db.webhookSubscription.update({ where: { id: subscription.id }, data: { failureCount, status: "disabled" } });
    await notifyWebhookDisabled(subscription.appId, subscription.id);
  } else {
    await db.webhookSubscription.update({ where: { id: subscription.id }, data: { failureCount } });
  }
}

// spec §7.1: a new Notification.type value ("webhook_disabled") delivered
// to the app's owner — a business-owned app notifies every business owner,
// mirroring how business_review/job_application already fan out to owners
// elsewhere in this codebase.
async function notifyWebhookDisabled(appId: string, subscriptionId: string): Promise<void> {
  const { notifyWebhookDisabled: notify } = await import("@/lib/notifications");
  const app = await db.developerApp.findUnique({
    where: { id: appId },
    include: { ownerBusiness: { include: { members: { where: { role: { in: ["owner"] } } } } } },
  });
  if (!app) return;

  if (app.ownerUserId) {
    await notify({ recipientId: app.ownerUserId, subjectId: subscriptionId });
  } else if (app.ownerBusiness) {
    for (const member of app.ownerBusiness.members) {
      await notify({ recipientId: member.userId, subjectId: subscriptionId });
    }
  }
}
