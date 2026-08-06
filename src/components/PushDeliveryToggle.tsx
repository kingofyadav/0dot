"use client";

import { setNotificationDeliveryPreferenceAction } from "@/app/actions/push";

// Same "checkbox auto-submits its own form on change" shape as
// SsoEnforcementToggle (org/[orgId]/manage) — one independent form per
// (type, channel) row so toggling one preference never affects another.
export function PushDeliveryToggle({ notificationType, channel, enabled }: { notificationType: string; channel: string; enabled: boolean }) {
  return (
    <form action={setNotificationDeliveryPreferenceAction}>
      <input type="hidden" name="notificationType" value={notificationType} />
      <input type="hidden" name="channel" value={channel} />
      <input
        type="checkbox"
        name="enabled"
        defaultChecked={enabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`Push notifications for ${notificationType}`}
      />
    </form>
  );
}
