"use client";

import { useActionState, useState } from "react";
import { createAffiliateProgram } from "@/app/actions/affiliates";

type Offering = { id: string; label: string };

// spec §7.1: a program targets exactly one of the creator's own
// tiers/products/courses — the offering-type select determines which id
// list the second select offers, both server-re-validated regardless (see
// affiliates.ts's ownsOffering).
export function AffiliateProgramForm({
  ownTiers,
  ownProducts,
  ownCourses,
}: {
  ownTiers: Offering[];
  ownProducts: Offering[];
  ownCourses: Offering[];
}) {
  const [state, formAction, pending] = useActionState(createAffiliateProgram, undefined);
  const [offeringType, setOfferingType] = useState("membership_tier");
  const options = offeringType === "membership_tier" ? ownTiers : offeringType === "digital_product" ? ownProducts : ownCourses;

  return (
    <form action={formAction} className="settingsForm">
      <div className="field">
        <label htmlFor="affOfferingType">Offering type</label>
        <select
          id="affOfferingType"
          name="offeringType"
          value={offeringType}
          onChange={(e) => setOfferingType(e.target.value)}
          className="textInput"
        >
          <option value="membership_tier">Membership tier</option>
          <option value="digital_product">Digital product</option>
          <option value="course">Course</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="affOfferingId">Offering</label>
        <select id="affOfferingId" name="offeringId" className="textInput" required>
          {options.length === 0 && <option value="">Nothing to promote yet</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="affCommission">Commission (%)</label>
        <input id="affCommission" name="commissionPercent" type="number" min="1" max="100" step="1" defaultValue={10} required />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending || options.length === 0}>
        {pending ? "Creating…" : "Create program"}
      </button>
    </form>
  );
}
