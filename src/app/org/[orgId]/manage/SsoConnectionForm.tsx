"use client";

import { useActionState } from "react";
import { configureSsoConnection } from "@/app/actions/organizations";

export function SsoConnectionForm({
  organizationId,
  protocol,
  idpMetadataJson,
}: {
  organizationId: string;
  protocol: string;
  idpMetadataJson: string;
}) {
  const [state, formAction, pending] = useActionState(configureSsoConnection, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="field">
        <label htmlFor="protocol">Protocol</label>
        <select id="protocol" name="protocol" defaultValue={protocol}>
          <option value="saml2">SAML 2.0</option>
          <option value="oidc">OIDC</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="idpMetadataJson">IdP metadata (JSON)</label>
        <textarea
          id="idpMetadataJson"
          name="idpMetadataJson"
          rows={4}
          defaultValue={idpMetadataJson}
          placeholder='{"issuer": "https://idp.example.com", "certificate": "..."}'
          required
        />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Saving…" : "Save SSO connection"}
      </button>
    </form>
  );
}
