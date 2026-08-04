"use client";

import { useActionState } from "react";
import { subscribeToTier } from "@/app/actions/memberships";

// spec §4: subscribe-to-a-tier form, same useActionState client-form
// pattern as TipForm.tsx. Rendered per-tier on the public profile, only for
// tiers the viewer isn't already subscribed to (see ProfilePage).
export function SubscribeForm({ tier }: { tier: { id: string; name: string; price: number; currency: string; billingInterval: string } }) {
  const [state, formAction, pending] = useActionState(subscribeToTier, undefined);

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="tierId" value={tier.id} />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{state.error}</p>}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Subscribing…" : `Subscribe — ${tier.price.toFixed(2)} ${tier.currency.toUpperCase()}/${tier.billingInterval === "yearly" ? "yr" : "mo"}`}
      </button>
    </form>
  );
}
