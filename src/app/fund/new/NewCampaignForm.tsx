"use client";

import { useActionState } from "react";
import { createFundraisingCampaign } from "@/app/actions/donations";

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createFundraisingCampaign, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "420px" }}>
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={160} className="textInput" />
      </div>
      <div>
        <label htmlFor="goalAmount">Goal amount (optional — leave blank for ongoing)</label>
        <input id="goalAmount" name="goalAmount" type="number" min="1" step="0.01" className="textInput" />
      </div>
      <input type="hidden" name="currency" value="usd" />
      <div>
        <label htmlFor="endsAt">Ends at (optional)</label>
        <input id="endsAt" name="endsAt" type="datetime-local" className="textInput" />
      </div>
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create fundraiser"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
