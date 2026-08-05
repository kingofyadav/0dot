"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/actions/organizations";

export default function NewOrganizationPage() {
  const [state, formAction, pending] = useActionState(createOrganization, undefined);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Create an organization</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Organizational controls for your own employees — SSO, an internal directory, internal
        communities, and audit logs. Separate from a public Business page; you don&apos;t need one to
        set this up.
      </p>

      <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
        <div className="field">
          <label htmlFor="name">Organization name</label>
          <input id="name" name="name" type="text" maxLength={100} required />
        </div>

        <div className="field">
          <label htmlFor="domain">Company email domain (optional)</label>
          <input id="domain" name="domain" type="text" placeholder="acme.com" />
          <span className="mutedText">
            Required before SSO or auto-matched employee sign-in can be enabled — verified via a DNS TXT
            record after creation.
          </span>
        </div>

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </button>
      </form>
    </div>
  );
}
