"use client";

import { setNotificationDeliveryPreferenceAction } from "@/app/actions/push";
import { Switch } from "@/components/Switch";

// Same "checkbox auto-submits its own form on change" shape as
// SsoEnforcementToggle (org/[orgId]/manage) — one independent form per
// (type, channel) row so toggling one preference never affects another.
// Renamed from PushDeliveryToggle (addendum §8): channel is now either
// "push" or "email", not push-only.
export function DeliveryToggle({ notificationType, channel, enabled }: { notificationType: string; channel: string; enabled: boolean }) {
  return (
    <form action={setNotificationDeliveryPreferenceAction}>
      <input type="hidden" name="notificationType" value={notificationType} />
      <input type="hidden" name="channel" value={channel} />
      <Switch
        name="enabled"
        value="on"
        defaultChecked={enabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`${channel === "email" ? "Email" : "Push"} notifications for ${notificationType}`}
      />
    </form>
  );
}
