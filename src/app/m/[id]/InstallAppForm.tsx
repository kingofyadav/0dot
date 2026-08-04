"use client";

import { useActionState, useState } from "react";
import { installApp, uninstallApp } from "@/app/actions/marketplace";

type TargetOption = { id: string; name: string };

// spec §4.3's three-way installer XOR (user | business | community), same
// "hosting as" selector shape NewEventForm already established for Event's
// own three-way host XOR.
export function InstallAppForm({
  listingId,
  businesses,
  communities,
}: {
  listingId: string;
  businesses: TargetOption[];
  communities: TargetOption[];
}) {
  const [state, formAction, pending] = useActionState(installApp, undefined);
  const [installerType, setInstallerType] = useState<"user" | "business" | "community">("user");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
      <input type="hidden" name="listingId" value={listingId} />

      <select
        name="installerType"
        value={installerType}
        onChange={(e) => setInstallerType(e.target.value as typeof installerType)}
        className="textInput"
      >
        <option value="user">My profile</option>
        {businesses.length > 0 && <option value="business">A business I manage</option>}
        {communities.length > 0 && <option value="community">A community I moderate</option>}
      </select>

      {installerType === "business" && (
        <select name="installerId" required defaultValue="" className="textInput">
          <option value="" disabled>
            Choose a business
          </option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {installerType === "community" && (
        <select name="installerId" required defaultValue="" className="textInput">
          <option value="" disabled>
            Choose a community
          </option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Installing…" : "Install"}
      </button>
    </form>
  );
}

export function UninstallAppButton({ installId }: { installId: string }) {
  return (
    <form action={uninstallApp}>
      <input type="hidden" name="installId" value={installId} />
      <button type="submit" className="button buttonDanger buttonSmall">
        Uninstall
      </button>
    </form>
  );
}
