"use client";

import { useActionState } from "react";
import { updateBillingPlan } from "@/app/actions/developer-apps";

const PLAN_LABEL: Record<string, string> = {
  free: "Free — rate-limited, no charge",
  pay_as_you_go: "Pay as you go — no hard cap, billed for usage beyond the included amount",
  committed: "Committed — flat monthly price, no hard cap",
};

export function BillingPlanForm({ appId, billingPlan }: { appId: string; billingPlan: string }) {
  const [state, formAction, pending] = useActionState(updateBillingPlan, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <input type="hidden" name="appId" value={appId} />
      <select name="billingPlan" defaultValue={billingPlan} className="textInput" style={{ maxWidth: "28rem" }}>
        {Object.entries(PLAN_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save billing plan"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
