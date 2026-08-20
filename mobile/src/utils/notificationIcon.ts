import type Ionicons from "@expo/vector-icons/Ionicons";

// Bucketed by meaning, not one icon per exact type (25+ values in the
// server's Notification.type catalog — src/lib/notifications.ts — would be
// unmaintainable 1:1). "tint" picks a theme color key: per
// docs/DESIGN_SYSTEM.md, success/warning/danger are reserved for genuine
// status (a like is not "danger" just because it's a heart), so most
// social/informational types stay "accent" and only real positive/negative
// outcomes (money received, something cancelled/removed) borrow
// success/warning/danger.
export type NotificationTint = "accent" | "success" | "warning" | "danger";

type IconName = keyof typeof Ionicons.glyphMap;

const ICON_BY_TYPE: Record<string, { icon: IconName; tint: NotificationTint }> = {
  like: { icon: "heart", tint: "accent" },
  comment: { icon: "chatbubble", tint: "accent" },
  mention: { icon: "at", tint: "accent" },
  new_follower: { icon: "person-add", tint: "accent" },
  follow_request: { icon: "person-add", tint: "accent" },
  follow_accepted: { icon: "checkmark-circle", tint: "success" },
  message: { icon: "mail", tint: "accent" },
  community_update: { icon: "people-circle", tint: "accent" },
  community_invite: { icon: "people-circle", tint: "accent" },
  business_review: { icon: "star", tint: "accent" },
  job_application: { icon: "briefcase", tint: "accent" },
  application_status: { icon: "briefcase", tint: "accent" },
  appointment_request: { icon: "calendar", tint: "accent" },
  appointment_confirmed: { icon: "calendar", tint: "success" },
  appointment_cancelled: { icon: "calendar", tint: "danger" },
  tip_received: { icon: "cash", tint: "success" },
  new_subscriber: { icon: "star", tint: "success" },
  affiliate_conversion: { icon: "cash", tint: "success" },
  livestream_started: { icon: "videocam", tint: "accent" },
  event_cancelled: { icon: "calendar", tint: "danger" },
  report_acknowledged: { icon: "shield-checkmark", tint: "accent" },
  case_resolved: { icon: "shield-checkmark", tint: "accent" },
  appeal_decided: { icon: "shield-checkmark", tint: "accent" },
  dmca_notice_received: { icon: "warning", tint: "warning" },
  dmca_content_removed: { icon: "warning", tint: "warning" },
  dmca_counter_notice_received: { icon: "shield", tint: "accent" },
  dmca_content_restored: { icon: "shield-checkmark", tint: "success" },
  dmca_strike_issued: { icon: "warning", tint: "danger" },
  org_member_added: { icon: "business", tint: "accent" },
  org_member_deactivated: { icon: "business", tint: "warning" },
  org_sso_configured: { icon: "business", tint: "accent" },
};

const DEFAULT_ICON: { icon: IconName; tint: NotificationTint } = { icon: "notifications", tint: "accent" };

export function getNotificationIcon(type: string): { icon: IconName; tint: NotificationTint } {
  return ICON_BY_TYPE[type] ?? DEFAULT_ICON;
}
