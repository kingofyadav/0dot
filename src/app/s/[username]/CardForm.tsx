"use client";

import { useActionState } from "react";
import { Briefcase, FileText, IdCard, Link2, Mail, type LucideIcon } from "lucide-react";
import { updateBusinessCard } from "@/app/actions/business-card";
import { CARD_FIELD_KEYS } from "@/lib/card-fields";
import { SettingsRow } from "@/components/SettingsRow";
import { Switch } from "@/components/Switch";

const FIELD_LABELS: Record<(typeof CARD_FIELD_KEYS)[number], string> = {
  bio: "Bio",
  workTitle: "Current title & company",
  email: "Email",
  socialLinks: "Social links",
};

const FIELD_ICONS: Record<(typeof CARD_FIELD_KEYS)[number], LucideIcon> = {
  bio: FileText,
  workTitle: Briefcase,
  email: Mail,
  socialLinks: Link2,
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
    <form action={formAction}>
      <div className="settingsGroup">
        <SettingsRow
          icon={IdCard}
          label="Enable my digital business card"
          trailing={<Switch name="enabled" defaultChecked={enabled} aria-label="Enable my digital business card" />}
        />
      </div>

      <p className="settingsGroupLabel">Fields shown on the card</p>
      <div className="settingsGroup">
        {CARD_FIELD_KEYS.map((key) => (
          <SettingsRow
            key={key}
            icon={FIELD_ICONS[key]}
            label={FIELD_LABELS[key]}
            trailing={<Switch name={`field_${key}`} defaultChecked={includedFields.includes(key)} aria-label={FIELD_LABELS[key]} />}
          />
        ))}
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
