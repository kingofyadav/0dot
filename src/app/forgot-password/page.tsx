"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <div className="authWrap">
      <form action={formAction} className="authCard">
        <div className="authHeader">
          <ThemeToggleLogo size={48} />
          <p>Account recovery</p>
        </div>
        <h1>Forgot password</h1>
        <p className="mutedText">
          Enter the email or mobile number on your account and we&apos;ll send a reset link to your registered email.
        </p>

        <div className="field">
          <label htmlFor="identifier">Email or mobile number</label>
          <input id="identifier" name="identifier" type="text" autoComplete="username" required />
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
