"use client";

import { useActionState } from "react";
import { Crown } from "lucide-react";
import { purchaseVipAction } from "@/app/actions/wallet";

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

  if (subscription) {
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
            <input type="hidden" name="billingInterval" value={subscription.billingInterval} />
            <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
              {pending ? "Renewing…" : `Renew now (${subscription.billingInterval === "yearly" ? prices.yearly : prices.monthly} coins)`}
            </button>
          </form>
        )}
        {state?.error && <p className="errorText">{state.error}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="walletVipCard">
      <div className="walletVipCardHeading">
        <Crown size={18} className="walletVipIcon" aria-hidden="true" />
        <strong>Go VIP</strong>
      </div>
      <p className="mutedText" style={{ fontSize: "0.85rem", marginBottom: "0.6rem" }}>
        One purchase unlocks every Premium perk platform-wide — raised link cap, full analytics history, extra theme
        presets, a custom domain, and a reduced platform fee on your earnings. Paid straight out of your coin balance.
      </p>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.6rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="monthly" defaultChecked style={{ width: "auto" }} />
          {prices.monthly} coins/month
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="yearly" style={{ width: "auto" }} />
          {prices.yearly} coins/year
        </label>
      </div>
      <button type="submit" className="button" disabled={pending || coinBalance < prices.monthly}>
        {pending ? "Purchasing…" : "Buy VIP with coins"}
      </button>
      {coinBalance < prices.monthly && <p className="mutedText" style={{ fontSize: "0.8rem" }}>Top up first — you need at least {prices.monthly} coins.</p>}
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
