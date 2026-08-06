"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { login } from "@/app/actions/auth";
import { startSsoLogin } from "@/app/actions/sso";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";
import { AuthTrust } from "@/components/AuthTrust";
import { PasswordField } from "@/components/PasswordField";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [ssoState, ssoFormAction, ssoPending] = useActionState(startSsoLogin, undefined);
  // Controlled, unlike the password field below — a failed submit (server
  // action + form reset) shouldn't force retyping the identifier too, only
  // the password that was actually wrong.
  const [identifier, setIdentifier] = useState("");

  return (
    <div className="landingWrap">
      <div className="landingLogo">
        <ThemeToggleLogo size={40} />
      </div>

      <section className="landingHero">
        <h1>Welcome back.</h1>
        <p>Your one link, always exactly where you left it.</p>
        <Link href="/explore" className="exploreLiveButton">
          <span className="exploreLiveDot" aria-hidden="true" />
          Explore live
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <div className="authStack">
        <form action={formAction} className="authCard">
          <div className="authHeader">
            <ThemeToggleLogo size={48} />
            <p>Welcome</p>
          </div>
          <h1>Log in</h1>

          <div className="field">
            <label htmlFor="identifier">Email, username, or mobile number</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <PasswordField
            id="password"
            name="password"
            label="Password"
            autoComplete="current-password"
            required
          />

          {state?.error && <p className="errorText">{state.error}</p>}

          <button type="submit" className="button" disabled={pending}>
            {pending ? "Logging in…" : "Log in"}
          </button>

          <p className="authFooter">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <p className="authFooter">
            New here? <Link href="/signup">Create an account</Link>
          </p>
          <AuthTrust />
        </form>

        <div className="authDivider">
          <span>or</span>
        </div>

        {/* phase-14 spec §5: a separate form/action, deliberately not merged
            into the password login above — a work email here only ever
            resolves to an organization's SSO connection, never a password
            check. */}
        <form action={ssoFormAction} className="authCard">
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
    </div>
  );
}
