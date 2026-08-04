"use client";

import { useActionState } from "react";
import { linkDeveloperAppToListing } from "@/app/actions/marketplace";

// phase-10 spec §8's upgrade path, seller-facing half: pick one of your own
// active DeveloperApps to back this `app` listing with real API access
// instead of (or in addition to) its sandboxed embed payload.
export function LinkDeveloperAppForm({ listingId, apps, linkedAppName }: { listingId: string; apps: { id: string; name: string }[]; linkedAppName: string | null }) {
  const [state, formAction, pending] = useActionState(linkDeveloperAppToListing, undefined);

  if (apps.length === 0) return null;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.6rem", maxWidth: "32ch" }}>
      <input type="hidden" name="listingId" value={listingId} />
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        {linkedAppName ? `Linked to developer app: ${linkedAppName}` : "Link a developer app for real API access on install:"}
      </p>
      <select name="appId" required defaultValue="" className="textInput">
        <option value="" disabled>
          Choose an app
        </option>
        {apps.map((app) => (
          <option key={app.id} value={app.id}>
            {app.name}
          </option>
        ))}
      </select>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Linking…" : "Link app"}
      </button>
    </form>
  );
}
