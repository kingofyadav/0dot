"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { startSsoLogin } from "@/app/actions/sso";
import { Logo } from "@/components/Logo";
import { AuthTrust } from "@/components/AuthTrust";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [ssoState, ssoFormAction, ssoPending] = useActionState(startSsoLogin, undefined);
  // Controlled, unlike the password field below — a failed submit (server
  // action + form reset) shouldn't force retyping the email too, only the
  // password that was actually wrong.
  const [email, setEmail] = useState("");

  return (
    <div className="authWrap">
      <form action={formAction} className="authCard">
        <div className="authHeader">
          <Logo size={48} />
          <p>Welcome</p>
        </div>
        <h1>Log in</h1>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="authFooter">
          New here? <Link href="/signup">Create an account</Link>
        </p>
        <AuthTrust />
      </form>

      {/* phase-14 spec §5: a separate form/action, deliberately not merged
          into the password login above — a work email here only ever
          resolves to an organization's SSO connection, never a password
          check. */}
      <form action={ssoFormAction} className="authCard" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="ssoEmail">Sign in with your work email</label>
          <input id="ssoEmail" name="email" type="email" autoComplete="email" placeholder="you@company.com" />
        </div>
        {ssoState?.error && <p className="errorText">{ssoState.error}</p>}
        <button type="submit" className="button buttonSecondary" disabled={ssoPending}>
          {ssoPending ? "Looking up organization…" : "Continue with SSO"}
        </button>
      </form>
    </div>
  );
}
