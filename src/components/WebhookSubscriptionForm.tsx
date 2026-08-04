"use client";

import { useActionState } from "react";
import { createWebhookSubscription } from "@/app/actions/developer-apps";

export function WebhookSubscriptionForm({ appId, eventTypes }: { appId: string; eventTypes: string[] }) {
  const [state, formAction, pending] = useActionState(createWebhookSubscription, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "40ch" }}>
      <input type="hidden" name="appId" value={appId} />
      <div className="field">
        <label htmlFor="targetUrl">Target URL (https)</label>
        <input id="targetUrl" name="targetUrl" type="url" required className="textInput" placeholder="https://example.com/webhooks/0dot" />
      </div>
      <fieldset style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.5rem" }}>
        <legend className="mutedText" style={{ fontSize: "0.8rem" }}>
          Event types
        </legend>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {eventTypes.map((type) => (
            <label key={type} style={{ fontSize: "0.85rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input type="checkbox" name="eventTypes" value={type} />
              {type}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Adding…" : "Add subscription"}
      </button>
    </form>
  );
}
