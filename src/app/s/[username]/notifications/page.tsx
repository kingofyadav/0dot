import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AtSign,
  CalendarClock,
  CalendarX,
  Gift,
  Heart,
  MessageCircle,
  MessageSquare,
  Radio,
  Ticket,
  UserPlus,
  Users,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getNotificationVerb } from "@/lib/notifications";
import { EMAIL_NOTIFICATION_TYPES } from "@/lib/email";
import { DeliveryToggle } from "@/components/DeliveryToggle";
import { SettingsRow } from "@/components/SettingsRow";

export const metadata: Metadata = { title: "Notifications" };

// phase-15 spec §4.1: NotificationDeliveryPreference is per (user, type,
// channel) — in_app has no opt-out in this codebase's Phase 2 design.
// Curated, not every Notification.type value: system-generated types with
// no real per-user choice (moderation_action, dmca_*, org_*) are omitted,
// same "deliberately partial" posture as webhooks.ts's EVENT_SCOPE_MAP.
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

// addendum §8: canonical list now lives in email.ts (EMAIL_NOTIFICATION_TYPES)
// since dispatchEmailEvent enforces it as an eligibility check, not just a
// toggle list — imported above rather than redefined here.

const NOTIFICATION_ICONS: Record<(typeof PUSH_NOTIFICATION_TYPES)[number], LucideIcon> = {
  like: Heart,
  comment: MessageCircle,
  mention: AtSign,
  new_follower: UserPlus,
  message: MessageSquare,
  community_update: Users,
  tip_received: Gift,
  new_subscriber: UserCheck,
  livestream_started: Radio,
  event_cancelled: CalendarX,
  ticket_purchased: Ticket,
  appointment_request: CalendarClock,
};

export default async function NotificationSettingsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.username?.handle !== username) redirect("/login");

  const [pushPrefs, emailPrefs, deviceCount] = await Promise.all([
    db.notificationDeliveryPreference.findMany({ where: { userId: currentUser.id, channel: "push" } }),
    db.notificationDeliveryPreference.findMany({ where: { userId: currentUser.id, channel: "email" } }),
    db.deviceToken.count({ where: { userId: currentUser.id } }),
  ]);
  const pushPrefByType = new Map(pushPrefs.map((p) => [p.notificationType, p.enabled]));
  const emailPrefByType = new Map(emailPrefs.map((p) => [p.notificationType, p.enabled]));

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Notifications</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        {deviceCount > 0
          ? `Push notifications are enabled on ${deviceCount} device${deviceCount === 1 ? "" : "s"}.`
          : "No devices registered for push yet — install the 0dot app to receive push notifications."}
      </p>

      <p className="settingsGroupLabel">Push notifications</p>
      <div className="settingsGroup">
        {PUSH_NOTIFICATION_TYPES.map((type) => (
          <SettingsRow
            key={type}
            icon={NOTIFICATION_ICONS[type]}
            label={getNotificationVerb(type) || type}
            trailing={<DeliveryToggle notificationType={type} channel="push" enabled={pushPrefByType.get(type) ?? true} />}
          />
        ))}
      </div>

      <p className="settingsGroupLabel" style={{ marginTop: "1.5rem" }}>
        Email notifications
      </p>
      <div className="settingsGroup">
        {EMAIL_NOTIFICATION_TYPES.map((type) => (
          <SettingsRow
            key={type}
            icon={NOTIFICATION_ICONS[type]}
            label={getNotificationVerb(type) || type}
            trailing={<DeliveryToggle notificationType={type} channel="email" enabled={emailPrefByType.get(type) ?? true} />}
          />
        ))}
      </div>
    </div>
  );
}
