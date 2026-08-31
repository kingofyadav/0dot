"use client";

import { useActionState, useState } from "react";
import { Crown } from "lucide-react";
import { purchaseVipAction } from "@/app/actions/wallet";
import { IdempotencyField } from "@/components/IdempotencyField";

type Interval = "monthly" | "yearly";

function priceFor(prices: Record<string, number>, interval: string): number {
  return prices[interval] ?? prices.monthly;
}

export function PurchaseVipForm({
  subscription,
  prices,
  coinBalance,
}: {
  subscription: { billingInterval: string; currentPeriodEnd: string; coinFunded: boolean } | null;
  prices: { monthly: number; yearly: number };
  coinBalance: number;
}) {
  const [state, formAction, pending] = useActionState(purchaseVipAction, undefined);
  const [interval, setInterval] = useState<Interval>("monthly");

  if (subscription) {
    // Renew on the plan the user is actually on — the charge and the price
    // shown must agree (review finding #8), so both read
    // subscription.billingInterval, not a hardcoded interval.
    const renewPrice = priceFor(prices, subscription.billingInterval);
    const cantAfford = coinBalance < renewPrice;
    return (
      <div className="walletVipCard walletVipCard--active">
        <div className="walletVipCardHeading">
          <Crown size={18} className="walletVipIcon" aria-hidden="true" />
          <strong>VIP active</strong>
        </div>
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          Billed {subscription.billingInterval} · renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
        {subscription.coinFunded && (
          <form action={formAction} style={{ marginTop: "0.4rem" }}>
            <IdempotencyField />
            <input type="hidden" name="billingInterval" value={subscription.billingInterval} />
            <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending || cantAfford}>
              {pending ? "Renewing…" : `Renew now (${renewPrice} coin${renewPrice === 1 ? "" : "s"})`}
            </button>
            {cantAfford && (
              <p className="mutedText" style={{ fontSize: "0.8rem" }}>
                You need at least {renewPrice} coin{renewPrice === 1 ? "" : "s"}.
              </p>
            )}
          </form>
        )}
        {state?.error && <p className="errorText">{state.error}</p>}
      </div>
    );
  }

  const price = priceFor(prices, interval);
  const cantAfford = coinBalance < price;

  return (
    <form action={formAction} className="walletVipCard">
      <div className="walletVipCardHeading">
        <Crown size={18} className="walletVipIcon" aria-hidden="true" />
        <strong>Go VIP</strong>
      </div>
      <p className="mutedText" style={{ fontSize: "0.85rem", marginBottom: "0.6rem" }}>
        One purchase unlocks every Premium perk platform-wide — raised link cap, full analytics history, extra theme
        presets, a custom domain, and a reduced platform fee on your earnings. Paid straight out of your coin balance
        (1 coin = $1); renew with a fresh coin charge each period.
      </p>
      <IdempotencyField />
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
        {(["monthly", "yearly"] as const).map((value) => (
          <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <input
              type="radio"
              name="billingInterval"
              value={value}
              checked={interval === value}
              onChange={() => setInterval(value)}
              style={{ width: "auto" }}
            />
            {value === "monthly" ? "Monthly" : "Yearly"} · {prices[value]} coin{prices[value] === 1 ? "" : "s"}
          </label>
        ))}
      </div>
      <button type="submit" className="button" disabled={pending || cantAfford}>
        {pending ? "Unlocking…" : `Unlock VIP — ${price} coin${price === 1 ? "" : "s"}`}
      </button>
      {cantAfford && (
        <p className="mutedText" style={{ fontSize: "0.8rem" }}>
          You need at least {price} coin{price === 1 ? "" : "s"}.
        </p>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
