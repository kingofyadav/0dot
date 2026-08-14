"use client";

import { useActionState } from "react";
import { requestCoinPayout } from "@/app/actions/wallet";

// Same useActionState client-form pattern as CreateTopUpForm.tsx, the
// reverse direction. Disabled entirely (via the parent not rendering the
// form) until a payout address is on file — see wallet/page.tsx.
export function RequestPayoutForm({ coinBalance }: { coinBalance: number }) {
  const [state, formAction, pending] = useActionState(requestCoinPayout, undefined);

  if (state?.success) {
    return <p className="mutedText">Payout requested — an admin will send it to your UPI address shortly.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <div className="field">
        <label htmlFor="payoutCoinAmount">Coins to cash out (1 coin = $1)</label>
        <input
          id="payoutCoinAmount"
          name="coinAmount"
          type="number"
          min="50"
          max={coinBalance}
          step="1"
          defaultValue={Math.min(50, coinBalance)}
          required
        />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary" disabled={pending || coinBalance < 50}>
        {pending ? "Requesting…" : "Request payout"}
      </button>
    </form>
  );
}
