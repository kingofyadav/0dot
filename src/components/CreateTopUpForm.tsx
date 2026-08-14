"use client";

import { useActionState } from "react";
import { createTopUpRequest } from "@/app/actions/wallet";

// Same useActionState client-form pattern as TipForm.tsx.
export function CreateTopUpForm() {
  const [state, formAction, pending] = useActionState(createTopUpRequest, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <div className="field">
        <label htmlFor="coinAmount">Coins to buy (1 coin = $1, paid via UPI)</label>
        <input id="coinAmount" name="coinAmount" type="number" min="10" max="1000" step="1" defaultValue="10" required />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Starting…" : "Top up with UPI"}
      </button>
    </form>
  );
}
