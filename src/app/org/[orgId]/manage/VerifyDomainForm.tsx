"use client";

import { useActionState } from "react";
import { verifyOrganizationDomain } from "@/app/actions/organizations";

export function VerifyDomainForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(verifyOrganizationDomain, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
      <input type="hidden" name="organizationId" value={organizationId} />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Checking…" : "Verify domain"}
      </button>
    </form>
  );
}
