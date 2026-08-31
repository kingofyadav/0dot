"use client";

import { useActionState, useState } from "react";
import { grantCoinsAction } from "@/app/actions/admin-wallet";

export function GrantCoinsForm() {
  const [state, formAction, pending] = useActionState(grantCoinsAction, undefined);
  const [targetKind, setTargetKind] = useState("user");
  const [mode, setMode] = useState("promo_grant");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "34ch" }}>
      <label className="field">
        Type
        <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="promo_grant">Promo grant (restricted, can expire)</option>
          <option value="admin_adjustment">Goodwill / correction (spendable)</option>
        </select>
      </label>

      <label className="field">
        Target
        <select name="targetKind" value={targetKind} onChange={(e) => setTargetKind(e.target.value)}>
          <option value="user">User (@username)</option>
          <option value="business">Business (slug)</option>
        </select>
      </label>

      {targetKind === "business" ? (
        <input name="targetSlug" placeholder="business-slug" className="textInput" required />
      ) : (
        <input name="targetHandle" placeholder="username" className="textInput" required />
      )}

      <input name="coins" type="number" step="1" placeholder="Coins (negative to correct down)" className="textInput" required />
      {mode === "promo_grant" && (
        <input name="expiresInDays" type="number" min="1" placeholder="Expires in N days (optional)" className="textInput" />
      )}
      <input name="reason" placeholder="Reason (required, audited)" className="textInput" required minLength={3} />

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText" style={{ fontSize: "0.85rem" }}>Done — recorded in the issuance audit.</p>}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Issuing…" : "Issue"}
      </button>
    </form>
  );
}
