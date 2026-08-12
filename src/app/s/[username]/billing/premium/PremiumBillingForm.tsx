"use client";

import { useActionState } from "react";
import { subscribeToPremiumAction, cancelPremiumAction } from "@/app/actions/platform-billing";
import { ConfirmButton } from "@/components/ConfirmButton";

export function PremiumBillingForm({
  subscription,
  prices,
}: {
  subscription: { id: string; status: string; billingInterval: string; currentPeriodEnd: string } | null;
  prices: { monthly: number; yearly: number; currency: string };
}) {
  const [state, formAction, pending] = useActionState(subscribeToPremiumAction, undefined);

  if (subscription) {
    const isCancelling = subscription.status === "cancelled";
    return (
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p>
          <strong>{isCancelling ? "Premium (cancelling)" : "Premium active"}</strong> — billed {subscription.billingInterval}
        </p>
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          {isCancelling ? "Access continues until " : "Renews "}
          {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
        </p>
        {!isCancelling && (
          <form action={cancelPremiumAction} style={{ marginTop: "0.3rem" }}>
            <input type="hidden" name="subscriptionId" value={subscription.id} />
            <ConfirmButton
              className="button buttonDanger buttonSmall"
              title="Cancel Premium?"
              description="You'll keep every Premium perk until the current billing period ends, then your account reverts to the free tier — nothing is deleted, links over the free cap are hidden until you resubscribe."
              confirmLabel="Cancel Premium"
              icon={null}
            >
              Cancel Premium
            </ConfirmButton>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="settingsGroup" style={{ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", gap: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="monthly" defaultChecked style={{ width: "auto" }} />
          ${prices.monthly}/month
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="radio" name="billingInterval" value="yearly" style={{ width: "auto" }} />
          ${prices.yearly}/year
        </label>
      </div>
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Subscribing…" : "Subscribe to Premium"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
