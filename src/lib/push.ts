import "server-only";
import { db } from "@/lib/db";

export type PushPlatform = "ios" | "android" | "web_push";
export const PUSH_PLATFORMS: PushPlatform[] = ["ios", "android", "web_push"];

// spec §4: same "swappable interface, stub implementation" posture as
// payments.ts's PaymentProcessor — no APNs/FCM credentials exist to wire up
// yet, so sending is a no-op stand-in for real push infra, not a model for
// how the real integration should behave.
export interface PushProvider {
  readonly name: string;
  send(args: { token: string; platform: PushPlatform; title: string; body: string }): Promise<boolean>;
}

class StubPushProvider implements PushProvider {
  readonly name = "stub";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is the PushProvider interface contract; the stub doesn't need the argument.
  async send(args: { token: string; platform: PushPlatform; title: string; body: string }) {
    return true;
  }
}

const provider: PushProvider = new StubPushProvider();

export function getPushProvider(): PushProvider {
  return provider;
}

// spec §3/§4.1: appClientId ties a token to the first-party app that
// registered it — upserted on (userId, token) so a re-registration (app
// relaunch, token refresh) just bumps lastSeenAt instead of duplicating.
export async function registerDeviceToken(args: { userId: string; platform: PushPlatform; token: string; appClientId: string }): Promise<void> {
  await db.deviceToken.upsert({
    where: { userId_token: { userId: args.userId, token: args.token } },
    create: { userId: args.userId, platform: args.platform, token: args.token, appClientId: args.appClientId },
    update: { lastSeenAt: new Date(), appClientId: args.appClientId, platform: args.platform },
  });
}

export async function unregisterDeviceToken(userId: string, token: string): Promise<void> {
  await db.deviceToken.deleteMany({ where: { userId, token } });
}

// spec §4.4: revoking a first-party app's OAuthAuthorization (the
// "connected apps" revoke flow, §3.3) also clears the device tokens it
// registered — a stale token must not keep receiving pushes after
// disconnect, same principle logout applies at the session layer
// (destroySession, session.ts).
export async function clearDeviceTokensForApp(userId: string, appClientId: string): Promise<void> {
  await db.deviceToken.deleteMany({ where: { userId, appClientId } });
}

// phase-15 spec §4.4: "revoking/logging out clears the associated
// DeviceToken" — called from destroySession (session.ts) so that module
// doesn't reach directly into a table push.ts otherwise owns (the same
// module-boundary this file already keeps for clearDeviceTokensForApp
// above). Scoped to "web_push" only: that subscription belongs to this one
// browser session, unlike an ios/android token tied to a long-lived app
// install that should survive a single web logout.
export async function clearWebPushTokensForUser(userId: string): Promise<void> {
  await db.deviceToken.deleteMany({ where: { userId, platform: "web_push" } });
}

export async function setDeliveryPreference(args: { userId: string; notificationType: string; channel: string; enabled: boolean }): Promise<void> {
  await db.notificationDeliveryPreference.upsert({
    where: { userId_notificationType_channel: { userId: args.userId, notificationType: args.notificationType, channel: args.channel } },
    create: { userId: args.userId, notificationType: args.notificationType, channel: args.channel, enabled: args.enabled },
    update: { enabled: args.enabled },
  });
}

async function isChannelEnabled(userId: string, notificationType: string, channel: string): Promise<boolean> {
  const pref = await db.notificationDeliveryPreference.findUnique({
    where: { userId_notificationType_channel: { userId, notificationType, channel } },
  });
  // spec §4.1's data model: "enabled boolean, default true" — no row means
  // the user has never opted out, not that push is off.
  return pref?.enabled ?? true;
}

// spec §4.2: push is a third delivery channel on the exact same
// Notification.type/subjectType catalog in_app (Phase 2) and webhook
// (Phase 10) already deliver — called from notifications.ts's
// createNotification, same call-site shape as dispatchWebhookEvent
// (webhooks.ts). Never throws: an unreachable device must not break the
// in-app notification it's mirroring.
export async function dispatchPushEvent(args: { recipientId: string; type: string; subjectType: string; subjectId: string }): Promise<void> {
  try {
    if (!(await isChannelEnabled(args.recipientId, args.type, "push"))) return;

    const tokens = await db.deviceToken.findMany({ where: { userId: args.recipientId } });
    if (tokens.length === 0) return;

    // spec §4.3: sensitivity-inheritance principle from Phase 11 §3.2 —
    // push copy is the same generic verb text already shown in the in-app
    // notification rail (getNotificationVerb), never a rendering of the
    // private content itself (a DM body, a private note). Dynamic import
    // to avoid a load-time cycle (notifications.ts imports this module for
    // its own dispatch call).
    const { getNotificationVerb } = await import("@/lib/notifications");
    const body = getNotificationVerb(args.type, args.subjectType) || "You have a new notification";

    // Independent per-device sends — concurrent instead of one-at-a-time so
    // a user with several registered devices (phone + desktop + tablet)
    // doesn't wait for each provider call to finish before the next starts.
    await Promise.all(
      tokens.map((deviceToken) =>
        provider.send({ token: deviceToken.token, platform: deviceToken.platform as PushPlatform, title: "0dot", body })
      )
    );
  } catch {
    // Best-effort, same posture as dispatchWebhookEvent.
  }
}
