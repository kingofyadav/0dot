"use client";

import { useActionState } from "react";
import { disableTwoFactor } from "@/app/actions/two-factor";
import { PasswordField } from "@/components/PasswordField";

export function DisableTwoFactorForm() {
  const [state, formAction, pending] = useActionState(disableTwoFactor, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <PasswordField id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" required />
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Two-factor authentication has been disabled.</p>}
      <button type="submit" className="button buttonDanger" disabled={pending}>
        {pending ? "Disabling…" : "Disable two-factor authentication"}
      </button>
    </form>
  );
}
