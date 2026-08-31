"use client";

import { useActionState } from "react";
import { sendTip } from "@/app/actions/tips";
import { IdempotencyField } from "@/components/IdempotencyField";

// phase-5 build plan §1 / spec §6: small amount+message form. The coin rail
// (addendum-coin-wallet-v2.md §6.4) works with no creator payout account,
// so this always renders for a signed-in viewer; `cardAvailable` just
// toggles the card button.
export function TipForm({
  creatorHandle,
  cardAvailable,
  viewerCoins,
}: {
  creatorHandle: string;
  cardAvailable: boolean;
  viewerCoins: number;
}) {
  const [state, formAction, pending] = useActionState(sendTip, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="creatorHandle" value={creatorHandle} />
      <IdempotencyField />
      <div className="field">
        <label htmlFor="tipAmount">Amount (USD)</label>
        <input id="tipAmount" name="amount" type="number" min="1" max="500" step="0.01" defaultValue="5" required />
      </div>
      <div className="field">
        <label htmlFor="tipMessage">Message (optional, public)</label>
        <textarea id="tipMessage" name="message" maxLength={280} rows={2} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText" style={{ fontSize: "0.85rem" }}>Thanks — your tip was sent.</p>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {cardAvailable && (
          <button type="submit" name="payWith" value="card" className="button" disabled={pending}>
            {pending ? "Sending…" : "Tip with card"}
          </button>
        )}
        <button
          type="submit"
          name="payWith"
          value="coins"
          className={cardAvailable ? "button buttonSecondary" : "button"}
          disabled={pending || viewerCoins <= 0}
        >
          {pending ? "Sending…" : `Tip with coins${viewerCoins > 0 ? ` · ${viewerCoins} available` : ""}`}
        </button>
      </div>
      {viewerCoins <= 0 && <p className="mutedText" style={{ fontSize: "0.8rem" }}>You have no coins yet.</p>}
    </form>
  );
}
