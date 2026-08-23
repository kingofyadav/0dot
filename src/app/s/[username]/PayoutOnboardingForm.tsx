"use client";

import { useActionState } from "react";
import { startCreatorOnboarding } from "@/app/actions/payments";
import { STRIPE_CONNECT_SUPPORTED_COUNTRIES, PAYOUT_COUNTRY_COMING_SOON } from "@/lib/stripe-connect-countries";

const STATUS_LABEL: Record<string, string> = {
  onboarding: "Onboarding in progress",
  active: "Payouts enabled",
  restricted: "Payouts restricted",
};

// hasAccount: whether a CreatorPayoutAccount row with a processorAccountId
// already exists — once the Stripe Account is created its identity.country
// is immutable, so the country picker only makes sense before that point.
export function PayoutOnboardingForm({ status, hasAccount }: { status: string | null; hasAccount: boolean }) {
  const [state, formAction, pending] = useActionState(startCreatorOnboarding, undefined);

  if (status === "active") {
    return <span className="mutedText">{STATUS_LABEL.active} — you can now receive tips.</span>;
  }

  return (
    <form action={formAction} style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
      {status && <span className="mutedText">{STATUS_LABEL[status] ?? status}</span>}
      {!hasAccount && (
        <select name="country" required defaultValue="" className="input" aria-label="Payout country">
          <option value="" disabled>
            Select payout country
          </option>
          {STRIPE_CONNECT_SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.name}
            </option>
          ))}
          {PAYOUT_COUNTRY_COMING_SOON.map((c) => (
            <option key={c.iso} value={c.iso} disabled>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Enabling…" : status === "restricted" ? "Retry payout setup" : "Enable payouts"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
