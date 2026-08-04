"use client";

import { useActionState } from "react";
import { createAffiliateLink } from "@/app/actions/affiliates";

export function BecomeAffiliateForm({ programId, offeringLabel, commissionPercent }: { programId: string; offeringLabel: string; commissionPercent: number }) {
  const [state, formAction, pending] = useActionState(createAffiliateLink, undefined);

  return (
    <div>
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        {offeringLabel} <span className="mutedText">— {commissionPercent}% commission</span>
      </p>
      <form action={formAction}>
        <input type="hidden" name="programId" value={programId} />
        {state?.error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{state.error}</p>}
        <button type="submit" className="button buttonSmall" disabled={pending}>
          {pending ? "Joining…" : "Become an affiliate"}
        </button>
      </form>
    </div>
  );
}
