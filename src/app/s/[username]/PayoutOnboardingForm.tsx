"use client";

import { useActionState } from "react";
import { startCreatorOnboarding } from "@/app/actions/payments";

const STATUS_LABEL: Record<string, string> = {
  onboarding: "Onboarding in progress",
  active: "Payouts enabled",
  restricted: "Payouts restricted",
};

export function PayoutOnboardingForm({ status }: { status: string | null }) {
  const [, formAction, pending] = useActionState(startCreatorOnboarding, undefined);

  if (status === "active") {
    return <span className="mutedText">{STATUS_LABEL.active} — you can now receive tips.</span>;
  }

  return (
    <form action={formAction} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      {status && <span className="mutedText">{STATUS_LABEL[status] ?? status}</span>}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Enabling…" : status === "restricted" ? "Retry payout setup" : "Enable payouts"}
      </button>
    </form>
  );
}
