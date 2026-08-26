"use client";

import { useActionState } from "react";
import { createTier, updateTier } from "@/app/actions/memberships";

// spec §4: owner-only tier create/edit, same useActionState client-form
// pattern as EditProfileForm.tsx. One component for both modes (create vs.
// edit) rather than two near-identical forms, mirroring offerings.ts's
// single parseAndValidateFields shared by createOffering/updateOffering.
export function TierForm({
  tier,
}: {
  tier?: {
    id: string;
    name: string;
    level: number;
    price: number;
    currency: string;
    billingInterval: string;
    description: string;
    status: string;
  };
}) {
  const action = tier ? updateTier : createTier;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {tier && <input type="hidden" name="tierId" value={tier.id} />}
      <div className="field">
        <label htmlFor={`tierName-${tier?.id ?? "new"}`}>Name</label>
        <input id={`tierName-${tier?.id ?? "new"}`} name="name" defaultValue={tier?.name} maxLength={60} required />
      </div>
      <div className="field">
        <label htmlFor={`tierLevel-${tier?.id ?? "new"}`}>Level (higher = more exclusive)</label>
        <input id={`tierLevel-${tier?.id ?? "new"}`} name="level" type="number" min="1" step="1" defaultValue={tier?.level ?? 1} required />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`tierPrice-${tier?.id ?? "new"}`}>Price</label>
          <input id={`tierPrice-${tier?.id ?? "new"}`} name="price" type="number" min="0.01" step="0.01" defaultValue={tier?.price} required />
        </div>
        <div className="field">
          <label htmlFor={`tierCurrency-${tier?.id ?? "new"}`}>Currency</label>
          <input id={`tierCurrency-${tier?.id ?? "new"}`} name="currency" defaultValue={tier?.currency ?? "usd"} maxLength={3} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`tierInterval-${tier?.id ?? "new"}`}>Billing interval</label>
        <select id={`tierInterval-${tier?.id ?? "new"}`} name="billingInterval" defaultValue={tier?.billingInterval ?? "monthly"} className="textInput">
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`tierDescription-${tier?.id ?? "new"}`}>Description</label>
        <textarea id={`tierDescription-${tier?.id ?? "new"}`} name="description" defaultValue={tier?.description} maxLength={1000} rows={2} />
      </div>
      {tier && (
        <div className="field">
          <label htmlFor={`tierStatus-${tier.id}`}>Status</label>
          <select id={`tierStatus-${tier.id}`} name="status" defaultValue={tier.status} className="textInput">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : tier ? "Save changes" : "Create tier"}
      </button>
    </form>
  );
}
