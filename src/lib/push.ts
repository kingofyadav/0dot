import "server-only";
import { db } from "@/lib/db";
import { isUserOnline } from "@/lib/presence";

export type PushPlatform = "ios" | "android" | "web_push";
export const PUSH_PLATFORMS: PushPlatform[] = ["ios", "android", "web_push"];

// spec §4: same "swappable interface" posture as payments.ts's
// PaymentProcessor — ExpoPushProvider (below) is the live implementation;
// the interface itself stays the seam a future direct-APNs/FCM provider
// would implement without dispatchPushEvent's call site changing.
export interface PushProvider {
  readonly name: string;
  // data.href lets a client deep-link straight to the notification's
  // subject on tap (mobile/src/push/pushNavigation.ts) — the same relative
  // path getNotificationHref already computes for the in-app rail, reused
  // here rather than re-derived client-side.
  send(args: { token: string; platform: PushPlatform; title: string; body: string; data: { href: string } }): Promise<PushSendResult>;
}

// invalidToken flags the one case dispatchPushEvent should actually act on
// (prune the dead DeviceToken row) rather than just log and move on — a
// generic delivery failure (offline device, transient relay error) says
// nothing about whether the token itself is still good.
export type PushSendResult = { ok: boolean; invalidToken?: boolean };

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

// Talks to Expo's own push relay rather than APNs/FCM directly — see
// mobile/src/push/registerPush.ts's own comment for the reasoning
// (matching this app's existing full EAS dependency for builds, zero
// Apple/Google credentials to hold in this codebase, one call covers both
// platforms). registerPush.ts registers Expo push tokens
// (ExponentPushToken[...]) via getExpoPushTokenAsync, which is what this
// class expects in `token`.
class ExpoPushProvider implements PushProvider {
  readonly name = "expo";

  async send(args: { token: string; platform: PushPlatform; title: string; body: string; data: { href: string } }): Promise<PushSendResult> {
    // Expo's relay only understands Expo push tokens — web_push is a
    // distinct Web Push/VAPID protocol, and nothing in this app registers
    // a web_push DeviceToken yet (no service-worker subscription flow
    // exists), so there's nothing to send here and no failure to report.
    if (args.platform === "web_push") return { ok: false };

    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify([{ to: args.token, title: args.title, body: args.body, data: args.data }]),
      });
    } catch {
      return { ok: false };
    }
    if (!res.ok) return { ok: false };

    const json = (await res.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
    const ticket = json?.data?.[0];
    if (!ticket || ticket.status !== "ok") {
      const invalidToken = ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered";
      return { ok: false, invalidToken };
    }
    return { ok: true };
  }
}

const provider: PushProvider = new ExpoPushProvider();

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
export async function dispatchPushEvent(args: { recipientId: string; actorId?: string | null; type: string; subjectType: string; subjectId: string }): Promise<void> {
  try {
    if (!(await isChannelEnabled(args.recipientId, args.type, "push"))) return;

    // Realtime addendum (docs/specs/addendum-realtime-community.md) Phase B:
    // foreground = SSE, background = push, never both for the same event. An
    // open SSE stream (mobile foregrounds it, web keeps it while the tab is
    // open) already delivers this notification live in-app via the message
    // bus — a push on top is redundant buzz. The presence store answers
    // "has an open stream" cross-instance; its 45s self-healing window
    // keeps a stale-positive from silently swallowing pushes for long.
    // Deliberately every type, not a subset: if you're looking at the app,
    // you see the in-app update regardless of what kind it is.
    if (await isUserOnline(args.recipientId)) return;

    const tokens = await db.deviceToken.findMany({ where: { userId: args.recipientId } });
    if (tokens.length === 0) return;

    // spec §4.3: sensitivity-inheritance principle from Phase 11 §3.2 —
    // push copy is the same generic verb text already shown in the in-app
    // notification rail (getNotificationVerb), never a rendering of the
    // private content itself (a DM body, a private note). Dynamic import
    // to avoid a load-time cycle (notifications.ts imports this module for
    // its own dispatch call).
    const { getNotificationVerb, getNotificationHref } = await import("@/lib/notifications");
    const body = getNotificationVerb(args.type, args.subjectType, args.subjectId) || "You have a new notification";

    // href reuses the exact same routing getNotificationHref already
    // computes for the in-app rail (mobile/src/api/v1/notifications
    // route does the same) — actorId/recipientHandle are best-effort
    // (not every dispatchPushEvent call site has an actor, e.g.
    // job_alert_match), and getNotificationHref degrades gracefully
    // (falls back to /feed) when actor is null rather than crashing.
    const [actor, recipient] = await Promise.all([
      args.actorId ? db.user.findUnique({ where: { id: args.actorId }, include: { username: true } }) : null,
      db.user.findUnique({ where: { id: args.recipientId }, include: { username: true } }),
    ]);
    const href = getNotificationHref(
      { type: args.type, subjectType: args.subjectType, subjectId: args.subjectId, actor: actor ? { username: actor.username } : null },
      recipient?.username?.handle ?? null
    );

    // Independent per-device sends — concurrent instead of one-at-a-time so
    // a user with several registered devices (phone + desktop + tablet)
    // doesn't wait for each provider call to finish before the next starts.
    const results = await Promise.all(
      tokens.map(async (deviceToken) => ({
        id: deviceToken.id,
        result: await provider.send({ token: deviceToken.token, platform: deviceToken.platform as PushPlatform, title: "0dot", body, data: { href } }),
      }))
    );

    // A token the relay reports as DeviceNotRegistered (uninstalled app,
    // expired token) will never succeed again — prune it now rather than
    // re-attempting and failing on every future notification for this user.
    const staleIds = results.filter((r) => r.result.invalidToken).map((r) => r.id);
    if (staleIds.length > 0) {
      await db.deviceToken.deleteMany({ where: { id: { in: staleIds } } });
    }
  } catch {
    // Best-effort, same posture as dispatchWebhookEvent.
  }
}
