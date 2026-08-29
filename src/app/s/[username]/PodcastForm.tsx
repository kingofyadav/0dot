"use client";

import { useActionState } from "react";
import { createPodcast, updatePodcast } from "@/app/actions/podcasts";

export function PodcastForm({ podcast }: { podcast?: { id: string; title: string; description: string } }) {
  const action = podcast ? updatePodcast : createPodcast;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = podcast?.id ?? "new";

  return (
    <form action={formAction} className="settingsForm">
      {podcast && <input type="hidden" name="podcastId" value={podcast.id} />}
      <div className="field">
        <label htmlFor={`podcastTitle-${idSuffix}`}>Title</label>
        <input id={`podcastTitle-${idSuffix}`} name="title" defaultValue={podcast?.title} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`podcastDescription-${idSuffix}`}>Description</label>
        <textarea id={`podcastDescription-${idSuffix}`} name="description" defaultValue={podcast?.description} maxLength={2000} rows={2} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : podcast ? "Save changes" : "Create podcast"}
      </button>
    </form>
  );
}
