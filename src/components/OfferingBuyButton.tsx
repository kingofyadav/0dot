"use client";

import { useActionState } from "react";
import { purchaseOffering } from "@/app/actions/offerings";

// phase-9 spec §3.1: native in-app checkout for a priced Offering — same
// shape CourseBuyButton already established for Phase 5's purchase flow.
export function OfferingBuyButton({ offeringId, price, currency }: { offeringId: string; price: number; currency: string }) {
  const [state, formAction, pending] = useActionState(purchaseOffering, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="quantity" value="1" />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>{state.error}</p>}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Buying…" : `Buy — ${price.toFixed(2)} ${currency.toUpperCase()}`}
      </button>
    </form>
  );
}
