"use client";

import { useActionState } from "react";
import { createVoiceRoom } from "@/app/actions/voice-rooms";

export function NewVoiceRoomForm({ communityId }: { communityId: string }) {
  const [state, formAction, pending] = useActionState(createVoiceRoom, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "40ch" }}>
      <input type="hidden" name="communityId" value={communityId} />
      <label>
        Title
        <input type="text" name="title" maxLength={120} placeholder="Friday hangout" required className="textInput" />
      </label>
      <label>
        Start time (leave blank to start right now)
        <input type="datetime-local" name="startsAt" className="textInput" />
      </label>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}
