"use client";

import { useActionState, useState } from "react";
import { deactivateAccount, requestAccountDeletion } from "@/app/actions/account-lifecycle";
import { PasswordField } from "@/components/PasswordField";

function ConfirmDangerForm({
  action,
  confirmLabel,
  pendingLabel,
  successMessage,
}: {
  action: typeof deactivateAccount;
  confirmLabel: string;
  pendingLabel: string;
  successMessage: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.success) {
    return <p className="mutedText">{successMessage}</p>;
  }

  if (!confirming) {
    return (
      <button type="button" className="button buttonDanger" onClick={() => setConfirming(true)}>
        {confirmLabel}
      </button>
    );
  }

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <PasswordField id={`${confirmLabel}-password`} name="currentPassword" label="Confirm your password" autoComplete="current-password" required />
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="button buttonDanger" disabled={pending}>
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button type="button" className="button buttonSecondary" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeactivateAccountAction() {
  return (
    <ConfirmDangerForm
      action={deactivateAccount}
      confirmLabel="Deactivate account"
      pendingLabel="Deactivating…"
      successMessage="Your account has been deactivated and you've been signed out. Log back in within 30 days to reactivate it."
    />
  );
}

export function RequestAccountDeletionAction() {
  return (
    <ConfirmDangerForm
      action={requestAccountDeletion}
      confirmLabel="Delete account"
      pendingLabel="Requesting…"
      successMessage="Your account is scheduled for deletion in 30 days and you've been signed out. Log back in before then to cancel."
    />
  );
}
