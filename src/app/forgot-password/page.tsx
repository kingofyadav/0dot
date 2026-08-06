"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <div className="authWrap">
      <form action={formAction} className="authCard">
        <div className="authHeader">
          <Logo size={48} />
          <p>Account recovery</p>
        </div>
        <h1>Forgot password</h1>
        <p className="mutedText">
          Enter the email on your account and we&apos;ll send you a link to reset your password.
        </p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>

        <p className="authFooter">
          <Link href="/login">Back to log in</Link>
        </p>
      </form>
    </div>
  );
}
