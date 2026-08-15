"use client";

import { useActionState } from "react";
import { Crown } from "lucide-react";
import { purchaseVipAction } from "@/app/actions/wallet";

export function PurchaseVipForm({
  subscription,
  coinPrice,
  coinBalance,
}: {
  subscription: { billingInterval: string; currentPeriodEnd: string; coinFunded: boolean } | null;
  coinPrice: number;
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
              {pending ? "Renewing…" : `Renew now (${coinPrice} coin${coinPrice === 1 ? "" : "s"})`}
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
        presets, a custom domain, and a reduced platform fee on your earnings. Free to test right now — paid straight
        out of your coin balance.
      </p>
      <input type="hidden" name="billingInterval" value="monthly" />
      <button type="submit" className="button" disabled={pending || coinBalance < coinPrice}>
        {pending ? "Unlocking…" : `Unlock VIP — ${coinPrice} coin${coinPrice === 1 ? "" : "s"}`}
      </button>
      {coinBalance < coinPrice && <p className="mutedText" style={{ fontSize: "0.8rem" }}>You need at least {coinPrice} coin{coinPrice === 1 ? "" : "s"}.</p>}
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
