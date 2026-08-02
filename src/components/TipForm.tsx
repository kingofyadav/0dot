"use client";

import { useActionState } from "react";
import { sendTip } from "@/app/actions/tips";

// phase-5 build plan §1 / spec §6: small amount+message form, same
// useActionState client-form pattern as EditProfileForm.tsx. Rendered
// inside a <details> toggle on the public profile (matching the
// Share/Block sections' existing shape), only when the profile owner has
// an active CreatorPayoutAccount.
export function TipForm({ creatorHandle }: { creatorHandle: string }) {
  const [state, formAction, pending] = useActionState(sendTip, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="creatorHandle" value={creatorHandle} />
      <div className="field">
        <label htmlFor="tipAmount">Amount (USD)</label>
        <input id="tipAmount" name="amount" type="number" min="1" max="500" step="0.01" defaultValue="5" required />
      </div>
      <div className="field">
        <label htmlFor="tipMessage">Message (optional, public)</label>
        <textarea id="tipMessage" name="message" maxLength={280} rows={2} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Sending…" : `Send a tip`}
      </button>
    </form>
  );
}
