import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getNotificationVerb } from "@/lib/notifications";
import { PushDeliveryToggle } from "@/components/PushDeliveryToggle";

// phase-15 spec §4.1: NotificationDeliveryPreference is per (user, type,
// channel) — this surfaces the "push" channel only (in_app has no opt-out
// in this codebase's Phase 2 design; email delivery isn't built by this
// phase). Curated, not every Notification.type value: system-generated
// types with no real per-user choice (moderation_action, dmca_*, org_*)
// are omitted, same "deliberately partial" posture as webhooks.ts's
// EVENT_SCOPE_MAP.
const PUSH_NOTIFICATION_TYPES = [
  "like",
  "comment",
  "mention",
  "new_follower",
  "message",
  "community_update",
  "tip_received",
  "new_subscriber",
  "livestream_started",
  "event_cancelled",
  "ticket_purchased",
  "appointment_request",
] as const;

export default async function NotificationSettingsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.username?.handle !== username) redirect("/login");

  const prefs = await db.notificationDeliveryPreference.findMany({ where: { userId: currentUser.id, channel: "push" } });
  const prefByType = new Map(prefs.map((p) => [p.notificationType, p.enabled]));
  const deviceCount = await db.deviceToken.count({ where: { userId: currentUser.id } });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Notifications</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        {deviceCount > 0
          ? `Push notifications are enabled on ${deviceCount} device${deviceCount === 1 ? "" : "s"}.`
          : "No devices registered for push yet — install the 0dot app to receive push notifications."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {PUSH_NOTIFICATION_TYPES.map((type) => (
          <div key={type} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>{getNotificationVerb(type) || type}</span>
            <PushDeliveryToggle notificationType={type} channel="push" enabled={prefByType.get(type) ?? true} />
          </div>
        ))}
      </div>
    </div>
  );
}
