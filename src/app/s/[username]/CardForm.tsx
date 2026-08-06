"use client";

import { useActionState } from "react";
import { updateBusinessCard } from "@/app/actions/business-card";
import { CARD_FIELD_KEYS } from "@/lib/card-fields";

const FIELD_LABELS: Record<(typeof CARD_FIELD_KEYS)[number], string> = {
  bio: "Bio",
  workTitle: "Current title & company",
  email: "Email",
  socialLinks: "Social links",
};

export function CardForm({
  enabled,
  includedFields,
}: {
  enabled: boolean;
  includedFields: string[];
}) {
  const [state, formAction, pending] = useActionState(updateBusinessCard, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input type="checkbox" name="enabled" value="true" defaultChecked={enabled} />
        Enable my digital business card
      </label>

      <p className="sectionHeading">Fields shown on the card</p>
      {CARD_FIELD_KEYS.map((key) => (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name={`field_${key}`} value="true" defaultChecked={includedFields.includes(key)} />
          {FIELD_LABELS[key]}
        </label>
      ))}

      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
