"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/app/actions/auth";
import { PasswordField } from "@/components/PasswordField";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <PasswordField id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" required />

      <PasswordField
        id="newPassword"
        name="newPassword"
        label="New password"
        autoComplete="new-password"
        minLength={8}
        required
        showStrength
      />

      <PasswordField
        id="confirmNewPassword"
        name="confirmNewPassword"
        label="Confirm new password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Password updated. Your other sessions have been signed out.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
