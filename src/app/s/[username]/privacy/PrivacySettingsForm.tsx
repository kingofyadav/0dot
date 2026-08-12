"use client";

import { useActionState } from "react";
import { updatePrivacySettings } from "@/app/actions/profile";

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
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="allowDmsFrom">Who can message you</label>
        <select id="allowDmsFrom" name="allowDmsFrom" defaultValue={allowDmsFrom}>
          <option value="everyone">Everyone</option>
          <option value="followers">People you follow</option>
          <option value="none">No one</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="allowTagging" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input id="allowTagging" name="allowTagging" type="checkbox" defaultChecked={allowTagging} style={{ width: "auto" }} />
          Allow others to tag you
        </label>
      </div>

      <div className="field">
        <label htmlFor="discoverableInSearch" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id="discoverableInSearch"
            name="discoverableInSearch"
            type="checkbox"
            defaultChecked={discoverableInSearch}
            style={{ width: "auto" }}
          />
          Show my profile in search results
        </label>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Privacy settings saved.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
