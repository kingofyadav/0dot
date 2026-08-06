"use client";

import { useActionState } from "react";
import { donate } from "@/app/actions/donations";

export function DonateForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState(donate, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "320px" }}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input name="amount" type="number" min="1" step="0.01" placeholder="Amount" required className="textInput" />
      <input name="message" placeholder="Message (optional)" maxLength={280} className="textInput" />
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input type="checkbox" name="isAnonymous" value="true" />
        Donate anonymously (hides your name from public view)
      </label>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Donating…" : "Donate"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
