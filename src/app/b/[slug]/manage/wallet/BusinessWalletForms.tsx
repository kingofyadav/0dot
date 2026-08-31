"use client";

import { useActionState } from "react";
import { subscribeBusinessWithCoinsAction } from "@/app/actions/platform-billing";
import { IdempotencyField } from "@/components/IdempotencyField";

// addendum-coin-wallet-v2.md §6.5 — spend the business wallet on the 0dot
// business subscription. Rendered only for owner/admin (the page gates it).
export function BusinessSubscribeWithCoinsForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(subscribeBusinessWithCoinsAction, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <input type="hidden" name="businessId" value={businessId} />
      <IdempotencyField />
      <div style={{ display: "flex", gap: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="monthly" defaultChecked style={{ width: "auto" }} />
          Monthly
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="yearly" style={{ width: "auto" }} />
          Yearly
        </label>
      </div>
      <button type="submit" className="button buttonSecondary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Paying…" : "Pay subscription with coins"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText" style={{ fontSize: "0.85rem" }}>Subscription paid from the business wallet.</p>}
    </form>
  );
}
