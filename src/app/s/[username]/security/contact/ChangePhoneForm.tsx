"use client";

import { useActionState } from "react";
import { requestPhoneChange, confirmPhoneChange } from "@/app/actions/account-contact";
import { PasswordField } from "@/components/PasswordField";
import { COUNTRY_CODES } from "@/lib/country-codes";

// Two-step, same shape as TwoFactorSetupForm's enrollment: request a code,
// then confirm it — but built on two useActionState hooks (each already
// returns the plain {error, success} ActionState shape) rather than
// direct-call + local state, since neither step needs richer data back.
export function ChangePhoneForm({ currentPhone }: { currentPhone: string | null }) {
  const [requestState, requestFormAction, requestPending] = useActionState(requestPhoneChange, undefined);
  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmPhoneChange, undefined);

  if (requestState?.success && !confirmState?.success) {
    return (
      <form action={confirmFormAction} className="authCard" style={{ maxWidth: "none" }}>
        <p className="mutedText">Enter the code we sent to your new number.</p>
        <div className="field">
          <label htmlFor="phone-change-code">Verification code</label>
          <input id="phone-change-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required />
        </div>
        {confirmState?.error && <p className="errorText">{confirmState.error}</p>}
        <button type="submit" className="button" disabled={confirmPending}>
          {confirmPending ? "Verifying…" : "Confirm"}
        </button>
      </form>
    );
  }

  if (confirmState?.success) {
    return <p className="mutedText">Mobile number updated.</p>;
  }

  return (
    <form action={requestFormAction} className="authCard" style={{ maxWidth: "none" }}>
      <p className="mutedText">Current mobile number: {currentPhone ?? "None on file"}</p>

      <div className="field">
        <label htmlFor="phoneNumber">New mobile number</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select
            id="phoneDialCode"
            name="phoneDialCode"
            defaultValue="91"
            aria-label="Country dial code"
            style={{ flexShrink: 0 }}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.iso} value={c.dialCode}>
                {c.name} (+{c.dialCode})
              </option>
            ))}
          </select>
          <input id="phoneNumber" name="phoneNumber" type="tel" autoComplete="tel-national" required />
        </div>
      </div>

      <PasswordField id="phone-change-password" name="currentPassword" label="Current password" autoComplete="current-password" required />

      {requestState?.error && <p className="errorText">{requestState.error}</p>}

      <button type="submit" className="button" disabled={requestPending}>
        {requestPending ? "Sending…" : "Send verification code"}
      </button>
    </form>
  );
}
