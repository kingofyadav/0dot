import * as Notifications from "expo-notifications";
import { resolvePath } from "../links/resolvePath";

// Tap-to-navigate for a push notification's data.href (src/lib/push.ts's
// dispatchPushEvent computes this via the same getNotificationHref the
// in-app notification rail uses) — through the same resolvePath every
// universal link and in-app "View post"/"View profile" action uses, so
// there's one navigation-mapping to maintain, not three. Real server-sent
// push still won't fire (StubPushProvider is a no-op end to end), so this
// is proven today via a locally-scheduled test notification with a
// matching data.href, ready for when real APNs/FCM delivery lands.
export function subscribeToPushNavigation(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const href = response.notification.request.content.data?.href;
    if (typeof href === "string") resolvePath(href);
  });
  return () => subscription.remove();
}
