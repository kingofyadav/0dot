"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
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
//
// Renders as a .settingsCard (same family as ChangePasswordForm /
// PremiumBillingForm) rather than being crammed into a SettingsRow's
// trailing slot: the country <select> plus submit button need a full-width
// stacked column to stay legible on a phone, which the trailing slot
// (flex-shrink: 0, sized for a switch or one small button) can't give them.
export function PayoutOnboardingForm({ status, hasAccount }: { status: string | null; hasAccount: boolean }) {
  const [state, formAction, pending] = useActionState(startCreatorOnboarding, undefined);

  if (status === "active") {
    return (
      <div className="settingsCard">
        <p className="row-sm" style={{ color: "var(--success)", fontWeight: 600 }}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {STATUS_LABEL.active}
        </p>
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          Your account is fully set up — tips, membership dues, and sales are paid out to your bank automatically.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="settingsCard">
      {status && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          {STATUS_LABEL[status] ?? status}
        </p>
      )}
      {!hasAccount && (
        <div className="field">
          <label htmlFor="payout-country">Payout country</label>
          <select id="payout-country" name="country" required defaultValue="" className="textInput">
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
                {c.name} (coming soon)
              </option>
            ))}
          </select>
          <span className="mutedText" style={{ fontSize: "0.8rem" }}>
            Your bank&apos;s country — this can&apos;t be changed once payouts are set up.
          </span>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Enabling…" : status === "restricted" ? "Retry payout setup" : "Enable payouts"}
      </button>
    </form>
  );
}
