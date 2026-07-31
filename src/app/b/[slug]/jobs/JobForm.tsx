"use client";

import { useActionState } from "react";
import { createJob } from "@/app/actions/jobs";

export function JobForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(createJob, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36ch" }}>
      <input type="hidden" name="businessId" value={businessId} />

      <input type="text" name="title" placeholder="Job title" maxLength={120} required className="textInput" />
      <textarea name="description" placeholder="Description" maxLength={5000} rows={4} required className="textInput" />

      <select name="employmentType" defaultValue="full_time" className="textInput">
        <option value="full_time">Full-time</option>
        <option value="part_time">Part-time</option>
        <option value="contract">Contract</option>
        <option value="internship">Internship</option>
      </select>

      <input type="text" name="location" placeholder="Location (optional)" maxLength={120} className="textInput" />
      <label className="mutedText" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <input type="checkbox" name="isRemote" value="true" />
        Remote
      </label>

      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input type="text" name="salaryMin" placeholder="Salary min (optional)" inputMode="decimal" className="textInput" style={{ flex: 1 }} />
        <input type="text" name="salaryMax" placeholder="Salary max (optional)" inputMode="decimal" className="textInput" style={{ flex: 1 }} />
      </div>

      <label className="mutedText" style={{ fontSize: "0.8rem" }}>
        Closes at (optional)
      </label>
      <input type="date" name="closesAt" className="textInput" />

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Posting…" : "Post job"}
      </button>
    </form>
  );
}
