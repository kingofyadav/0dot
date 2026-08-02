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
    return <p className="mutedText">{STATUS_LABEL.active} — you can now receive tips.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      {status && <p className="mutedText" style={{ margin: 0 }}>{STATUS_LABEL[status] ?? status}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Enabling…" : status === "restricted" ? "Retry payout setup" : "Enable payouts"}
      </button>
    </form>
  );
}
