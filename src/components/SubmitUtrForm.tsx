"use client";

import { useActionState } from "react";
import { submitTopUpUtr } from "@/app/actions/wallet";

export function SubmitUtrForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(submitTopUpUtr, undefined);

  if (state?.success) {
    return <p className="mutedText">UTR submitted — an admin will review it shortly.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="field">
        <label htmlFor="utr">UTR / reference number</label>
        <input id="utr" name="utr" type="text" minLength={6} maxLength={24} placeholder="From your UPI app's payment receipt" required />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Submitting…" : "I've paid — submit UTR"}
      </button>
    </form>
  );
}
