"use client";

import { setSsoEnforcement } from "@/app/actions/organizations";

export function SsoEnforcementToggle({ organizationId, enforced }: { organizationId: string; enforced: boolean }) {
  return (
    <form action={setSsoEnforcement} style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input
        type="checkbox"
        id="enforced"
        name="enforced"
        defaultChecked={enforced}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <label htmlFor="enforced" className="mutedText" style={{ fontSize: "0.85rem" }}>
        Require SSO for organization-scoped resources (internal communities, org admin). This never
        disables members&apos; ordinary email/password sign-in to their personal account.
      </label>
    </form>
  );
}
