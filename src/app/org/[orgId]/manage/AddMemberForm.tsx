"use client";

import { useActionState } from "react";
import { addOrganizationMember } from "@/app/actions/organizations";

export function AddMemberForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(addOrganizationMember, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <span className="mutedText">Must already have a 0dot account.</span>
      </div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: "140px" }}>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" type="text" maxLength={100} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: "140px" }}>
          <label htmlFor="department">Department</label>
          <input id="department" name="department" type="text" maxLength={100} />
        </div>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add member"}
      </button>
    </form>
  );
}
