"use client";

import { useActionState } from "react";
import { verifyLoginTwoFactor } from "@/app/actions/two-factor";

export function Login2faForm() {
  const [state, formAction, pending] = useActionState(verifyLoginTwoFactor, undefined);

  return (
    <form action={formAction} className="authCard">
      <div className="authHeader">
        <p>Two-factor authentication</p>
      </div>
      <h1>Enter your code</h1>
      <p className="mutedText">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>

      <div className="field">
        <label htmlFor="code">Verification code</label>
        <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
