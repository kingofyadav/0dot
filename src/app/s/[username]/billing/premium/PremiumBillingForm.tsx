"use client";

import Link from "next/link";
import { cancelPremiumAction } from "@/app/actions/platform-billing";
import { ConfirmButton } from "@/components/ConfirmButton";

export function PremiumBillingForm({
  subscription,
}: {
  subscription: { id: string; status: string; billingInterval: string; currentPeriodEnd: string } | null;
}) {
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
    <div className="settingsGroup" style={{ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        Card payments are off right now — unlock Premium free with your coin balance instead.
      </p>
      <Link href="/wallet" className="button buttonSmall" style={{ alignSelf: "flex-start" }}>
        Go to Wallet
      </Link>
    </div>
  );
}
