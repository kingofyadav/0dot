"use client";

import { useActionState } from "react";
import { purchaseMarketplaceListing } from "@/app/actions/marketplace";

// spec §4.3/§5.1: nullable price means free — purchaseMarketplaceListing
// skips the payment backbone entirely for those, same nullable-price-means-
// free shape OfferingBuyButton already uses for Offering.
export function MarketplacePurchaseButton({
  listingId,
  price,
  currency,
}: {
  listingId: string;
  price: number | null;
  currency: string | null;
}) {
  const [state, formAction, pending] = useActionState(purchaseMarketplaceListing, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="listingId" value={listingId} />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>{state.error}</p>}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Getting it…" : price !== null ? `Buy — ${price.toFixed(2)} ${(currency ?? "usd").toUpperCase()}` : "Get it free"}
      </button>
    </form>
  );
}
