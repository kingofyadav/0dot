"use client";

import { useActionState } from "react";
import { editWikiPage } from "@/app/actions/wiki";

export function EditWikiPageForm({ wikiPageId, currentBody }: { wikiPageId: string; currentBody: string }) {
  const [state, formAction, pending] = useActionState(editWikiPage, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <input type="hidden" name="wikiPageId" value={wikiPageId} />
      <textarea name="body" rows={12} required defaultValue={currentBody} className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save edit"}
      </button>
    </form>
  );
}
