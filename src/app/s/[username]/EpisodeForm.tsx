"use client";

import { useActionState, useRef, useState } from "react";
import { createEpisode } from "@/app/actions/podcasts";

// spec §9.1: episode audio + optional tier gate, uploaded to
// protected-storage.ts (never a public URL, even for ungated episodes —
// see EpisodeForm's schema comment). durationS is read client-side from
// the audio file itself (same "computed client-side and trusted for
// display only" posture src/lib/uploads.ts already documents for voice
// note duration) rather than asked for as a manual number field.
export function EpisodeForm({ podcastId, ownTiers }: { podcastId: string; ownTiers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createEpisode, undefined);
  const [durationS, setDurationS] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const audio = new Audio(URL.createObjectURL(file));
    audio.addEventListener("loadedmetadata", () => setDurationS(Math.round(audio.duration)));
  }

  return (
    <form ref={formRef} action={formAction} className="settingsForm">
      <input type="hidden" name="podcastId" value={podcastId} />
      <input type="hidden" name="durationS" value={durationS ?? 0} />
      <div className="field">
        <label htmlFor={`epTitle-${podcastId}`}>Title</label>
        <input id={`epTitle-${podcastId}`} name="title" maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`epDescription-${podcastId}`}>Description</label>
        <textarea id={`epDescription-${podcastId}`} name="description" maxLength={2000} rows={2} />
      </div>
      <div className="field">
        <label htmlFor={`epFile-${podcastId}`}>Audio file</label>
        <input id={`epFile-${podcastId}`} name="file" type="file" accept="audio/mpeg,audio/mp4" onChange={handleFileChange} required />
      </div>
      <div className="field">
        <label htmlFor={`epTier-${podcastId}`}>Member-only (optional)</label>
        <select id={`epTier-${podcastId}`} name="requiredTierId" defaultValue="" className="textInput">
          <option value="">Public episode</option>
          {ownTiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name} and up</option>
          ))}
        </select>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Uploading…" : "Add episode"}
      </button>
    </form>
  );
}
