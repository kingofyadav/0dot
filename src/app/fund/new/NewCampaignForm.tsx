"use client";

import { useActionState } from "react";
import { createFundraisingCampaign } from "@/app/actions/donations";

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createFundraisingCampaign, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={160} />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={500} rows={3} />
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      <div className="field">
        <label htmlFor="goalAmount">Goal amount (optional — leave blank for ongoing)</label>
        <input id="goalAmount" name="goalAmount" type="number" min="1" step="0.01" />
      </div>
      <input type="hidden" name="currency" value="usd" />
      <div className="field">
        <label htmlFor="endsAt">Ends at (optional)</label>
        <input id="endsAt" name="endsAt" type="datetime-local" />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Create fundraiser"}
      </button>
    </form>
  );
}
