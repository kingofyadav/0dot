"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/app/actions/business-documents";

export function DocumentForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(uploadDocument, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="text" name="title" placeholder="Title" maxLength={120} required className="textInput" />
      <select name="visibility" defaultValue="public" className="textInput">
        <option value="public">Public — anyone can view</option>
        <option value="team_only">Team only</option>
      </select>
      <input type="file" name="file" accept=".pdf,.txt,image/png,image/jpeg,image/webp,image/gif" required className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
