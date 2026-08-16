"use client";

import { useActionState } from "react";
import { updatePrivacySettings } from "@/app/actions/profile";
import { SettingsRow } from "@/components/SettingsRow";
import { Switch } from "@/components/Switch";

export function PrivacySettingsForm({
  allowDmsFrom,
  allowTagging,
  discoverableInSearch,
}: {
  allowDmsFrom: string;
  allowTagging: boolean;
  discoverableInSearch: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePrivacySettings, undefined);

  return (
    <form action={formAction}>
      <div className="settingsGroup">
        <SettingsRow
          label="Who can message you"
          trailing={
            <select id="allowDmsFrom" name="allowDmsFrom" defaultValue={allowDmsFrom} className="settingsRowSelect">
              <option value="everyone">Everyone</option>
              <option value="followers">People you follow</option>
              <option value="none">No one</option>
            </select>
          }
        />
        <SettingsRow
          label="Allow others to tag you"
          trailing={<Switch name="allowTagging" value="on" defaultChecked={allowTagging} aria-label="Allow others to tag you" />}
        />
        <SettingsRow
          label="Show my profile in search results"
          trailing={
            <Switch
              name="discoverableInSearch"
              value="on"
              defaultChecked={discoverableInSearch}
              aria-label="Show my profile in search results"
            />
          }
        />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Privacy settings saved.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
