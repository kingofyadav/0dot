"use client";

import { togglePortfolioSectionVisibility } from "@/app/actions/portfolio-layout";
import { Switch } from "@/components/Switch";

// Same "checkbox auto-submits its own form on change" shape as
// PushDeliveryToggle.tsx — the parent page is a Server Component, which
// can't pass an inline onChange to Switch itself (functions can't cross
// the server/client boundary), so this small client wrapper owns it.
export function PortfolioSectionVisibilityToggle({ sectionKey, visible, label }: { sectionKey: string; visible: boolean; label: string }) {
  return (
    <form action={togglePortfolioSectionVisibility}>
      <input type="hidden" name="key" value={sectionKey} />
      <Switch
        name="visible"
        defaultChecked={visible}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`Show ${label} on public profile`}
      />
    </form>
  );
}
