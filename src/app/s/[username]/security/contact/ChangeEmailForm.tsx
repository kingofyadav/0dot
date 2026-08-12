"use client";

import { useActionState } from "react";
import { requestEmailChange } from "@/app/actions/account-contact";
import { PasswordField } from "@/components/PasswordField";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(requestEmailChange, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <p className="mutedText">Current email: {currentEmail}</p>

      <div className="field">
        <label htmlFor="newEmail">New email</label>
        <input id="newEmail" name="newEmail" type="email" autoComplete="email" required />
      </div>

      <PasswordField id="email-change-password" name="currentPassword" label="Current password" autoComplete="current-password" required />

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && (
        <p className="mutedText">Check your new inbox for a confirmation link. It expires in 24 hours.</p>
      )}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Sending…" : "Send confirmation link"}
      </button>
    </form>
  );
}
