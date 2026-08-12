"use client";

import { useActionState } from "react";
import { subscribeBusinessAction, cancelBusinessSubscriptionAction } from "@/app/actions/platform-billing";
import { claimBusinessCustomDomainAction, removeBusinessCustomDomainAction, retryBusinessDomainVerificationAction } from "@/app/actions/custom-domains";
import { ConfirmButton } from "@/components/ConfirmButton";

export function BusinessSubscribeForm({
  businessId,
  prices,
}: {
  businessId: string;
  prices: { monthly: number; yearly: number };
}) {
  const [state, formAction, pending] = useActionState(subscribeBusinessAction, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <input type="hidden" name="businessId" value={businessId} />
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
        {pending ? "Subscribing…" : "Subscribe"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}

export function BusinessCancelSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  return (
    <form action={cancelBusinessSubscriptionAction}>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <ConfirmButton
        className="button buttonDanger buttonSmall"
        title="Cancel subscription?"
        description="Access continues until the current billing period ends. Custom domains follow their own grace period before they stop serving."
        confirmLabel="Cancel subscription"
        icon={null}
      >
        Cancel subscription
      </ConfirmButton>
    </form>
  );
}

export function BusinessClaimDomainForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(claimBusinessCustomDomainAction, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <input type="hidden" name="businessId" value={businessId} />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input name="domain" type="text" placeholder="yourbusiness.com" required className="textInput" style={{ flex: "2 1 200px" }} />
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
          <input type="checkbox" name="isApex" style={{ width: "auto" }} />
          Root/apex domain
        </label>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Claiming…" : "Claim domain"}
        </button>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}

export function BusinessRemoveDomainButton({ customDomainId, businessId, domain }: { customDomainId: string; businessId: string; domain: string }) {
  return (
    <form action={removeBusinessCustomDomainAction}>
      <input type="hidden" name="customDomainId" value={customDomainId} />
      <input type="hidden" name="businessId" value={businessId} />
      <ConfirmButton
        className="button buttonDanger buttonSmall"
        title="Remove this domain?"
        description={`${domain} stops serving your business page. The domain string stays reserved to you for 90 days before it's released.`}
        confirmLabel="Remove"
      >
        Remove
      </ConfirmButton>
    </form>
  );
}

export function RetryDomainVerificationButton({ customDomainId, businessId }: { customDomainId: string; businessId: string }) {
  return (
    <form action={retryBusinessDomainVerificationAction}>
      <input type="hidden" name="customDomainId" value={customDomainId} />
      <input type="hidden" name="businessId" value={businessId} />
      <button type="submit" className="button buttonSecondary buttonSmall">
        Check DNS now
      </button>
    </form>
  );
}
