"use client";

import { useActionState } from "react";
import { resendVerificationEmail } from "@/app/actions/auth";

export function ResendVerificationButton() {
  const [state, formAction, pending] = useActionState(resendVerificationEmail, undefined);

  return (
    <form action={formAction}>
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="successText">Verification email sent.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Sending…" : "Resend email"}
      </button>
    </form>
  );
}
