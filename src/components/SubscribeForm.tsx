"use client";

import { useActionState } from "react";
import { subscribeToTier } from "@/app/actions/memberships";

// spec §4: subscribe-to-a-tier form. Coins pay the first period only
// (addendum-coin-wallet-v2.md §6.3) and need no creator payout account, so
// this renders for any signed-in viewer; `cardAvailable` toggles the card
// button.
export function SubscribeForm({
  tier,
  cardAvailable,
  viewerCoins,
}: {
  tier: { id: string; name: string; price: number; currency: string; billingInterval: string };
  cardAvailable: boolean;
  viewerCoins: number;
}) {
  const [state, formAction, pending] = useActionState(subscribeToTier, undefined);
  const per = tier.billingInterval === "yearly" ? "yr" : "mo";
  const canAffordCoins = viewerCoins >= tier.price;

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      <input type="hidden" name="tierId" value={tier.id} />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0", width: "100%" }}>{state.error}</p>}
      {state?.success && <p className="mutedText" style={{ margin: "0.2rem 0", width: "100%", fontSize: "0.85rem" }}>Subscribed.</p>}
      {cardAvailable && (
        <button type="submit" name="payWith" value="card" className="button buttonSmall" disabled={pending}>
          {pending ? "Subscribing…" : `Subscribe — ${tier.price.toFixed(2)} ${tier.currency.toUpperCase()}/${per}`}
        </button>
      )}
      <button
        type="submit"
        name="payWith"
        value="coins"
        className={cardAvailable ? "button buttonSmall buttonSecondary" : "button buttonSmall"}
        disabled={pending || !canAffordCoins}
      >
        {pending ? "Subscribing…" : `${tier.price} coins — first ${per === "yr" ? "year" : "month"}`}
      </button>
      {!canAffordCoins && (
        <p className="mutedText" style={{ margin: "0.2rem 0", width: "100%", fontSize: "0.8rem" }}>
          You have {viewerCoins} of {tier.price} coins.
        </p>
      )}
    </form>
  );
}
