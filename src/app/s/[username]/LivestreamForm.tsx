"use client";

import { useActionState } from "react";
import { createLivestream } from "@/app/actions/livestreams";

export function LivestreamForm({ ownTiers }: { ownTiers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createLivestream, undefined);

  return (
    <form action={formAction} className="settingsForm">
      <div className="field">
        <label htmlFor="liveTitle">Title</label>
        <input id="liveTitle" name="title" maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="liveScheduledAt">Scheduled for (optional)</label>
        <input id="liveScheduledAt" name="scheduledAt" type="datetime-local" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="liveTier">Member-only (optional)</label>
        <select id="liveTier" name="requiredTierId" defaultValue="" className="textInput">
          <option value="">Public livestream</option>
          {ownTiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name} and up</option>
          ))}
        </select>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Schedule livestream"}
      </button>
    </form>
  );
}
