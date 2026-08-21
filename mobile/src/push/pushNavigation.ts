import { resolvePath } from "../links/resolvePath";
import { Notifications } from "./expoNotificationsModule";

// Tap-to-navigate for a push notification's data.href (src/lib/push.ts's
// dispatchPushEvent computes this via the same getNotificationHref the
// in-app notification rail uses) — through the same resolvePath every
// universal link and in-app "View post"/"View profile" action uses, so
// there's one navigation-mapping to maintain, not three. Now backed by
// real server-sent push (push.ts's ExpoPushProvider), not just a
// locally-scheduled test notification — this listener's own shape didn't
// need to change, since expo-notifications delivers a relay-sent push
// through the same response event either way.
export function subscribeToPushNavigation(): () => void {
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const href = response.notification.request.content.data?.href;
    if (typeof href === "string") resolvePath(href);
  });
  return () => subscription.remove();
}
