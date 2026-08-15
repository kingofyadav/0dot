"use client";

import { useActionState } from "react";
import { transferCoinsAction } from "@/app/actions/wallet";

export function TransferCoinsForm() {
  const [state, formAction, pending] = useActionState(transferCoinsAction, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        Username
        <input type="text" name="handle" placeholder="e.g. jane" required autoComplete="off" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        Coins
        <input type="number" name="coinAmount" min={1} max={20} step={1} defaultValue={1} required />
      </label>
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Sending…" : "Send coins"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Sent!</p>}
    </form>
  );
}
