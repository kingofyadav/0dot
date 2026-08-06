"use client";

import { updateContactStage } from "@/app/actions/crm";

const STAGES = ["lead", "customer", "churned"];

export function ContactStageSelect({ contactId, stage }: { contactId: string; stage: string }) {
  return (
    <form action={updateContactStage}>
      <input type="hidden" name="contactId" value={contactId} />
      <select
        name="stage"
        defaultValue={stage}
        className="textInput"
        style={{ fontSize: "0.85rem" }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </form>
  );
}
