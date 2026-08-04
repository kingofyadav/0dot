"use client";

import { useActionState } from "react";
import { updateRedirectUris } from "@/app/actions/developer-apps";

export function RedirectUrisForm({ appId, redirectUris }: { appId: string; redirectUris: string[] }) {
  const [state, formAction, pending] = useActionState(updateRedirectUris, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "40ch" }}>
      <input type="hidden" name="appId" value={appId} />
      <textarea name="redirectUris" defaultValue={redirectUris.join("\n")} required className="textInput" rows={3} />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Saving…" : "Save redirect URIs"}
      </button>
    </form>
  );
}
