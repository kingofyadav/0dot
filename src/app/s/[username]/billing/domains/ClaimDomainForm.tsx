"use client";

import { useActionState } from "react";
import { claimProfileCustomDomainAction } from "@/app/actions/custom-domains";

export function ClaimDomainForm() {
  const [state, formAction, pending] = useActionState(claimProfileCustomDomainAction, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          name="domain"
          type="text"
          placeholder="links.yourdomain.com"
          required
          className="textInput"
          style={{ flex: "2 1 200px" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
          <input type="checkbox" name="isApex" style={{ width: "auto" }} />
          Root/apex domain
        </label>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Claiming…" : "Claim domain"}
        </button>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
