"use client";

import { useActionState } from "react";
import { createDeveloperApp } from "@/app/actions/developer-apps";

export function CreateDeveloperAppForm({ businesses }: { businesses: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createDeveloperApp, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "40ch" }}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={100} className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={1000} className="textInput" rows={3} />
      </div>
      <div className="field">
        <label htmlFor="ownerType">Owned by</label>
        <select id="ownerType" name="ownerType" defaultValue="user" className="textInput">
          <option value="user">You</option>
          {businesses.length > 0 && <option value="business">A business you own</option>}
        </select>
      </div>
      {businesses.length > 0 && (
        <div className="field">
          <label htmlFor="ownerBusinessId">Business</label>
          <select id="ownerBusinessId" name="ownerBusinessId" defaultValue="" className="textInput">
            <option value="">—</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="redirectUris">Redirect URIs (one per line)</label>
        <textarea id="redirectUris" name="redirectUris" required className="textInput" rows={3} placeholder="https://example.com/oauth/callback" />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Registering…" : "Register app"}
      </button>
    </form>
  );
}
