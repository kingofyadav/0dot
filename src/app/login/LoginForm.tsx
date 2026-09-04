"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { startSsoLogin } from "@/app/actions/sso";
import { AuthTopBar } from "@/components/AuthTopBar";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";
import { AuthTrust } from "@/components/AuthTrust";
import { DigitalHomeVisual } from "@/components/DigitalHomeVisual";
import { ExploreLiveLink } from "@/components/ExploreLiveLink";
import { PasswordField } from "@/components/PasswordField";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [ssoState, ssoFormAction, ssoPending] = useActionState(startSsoLogin, undefined);
  // Controlled, unlike the password field below — a failed submit (server
  // action + form reset) shouldn't force retyping the identifier too, only
  // the password that was actually wrong.
  const [identifier, setIdentifier] = useState("");

  // Login has no signup form to jump to, unlike /signup's own
  // focusFirstField — activating "Profile" here instead focuses the
  // identifier field, the closest equivalent "start here" action.
  function focusIdentifier() {
    document.getElementById("identifier")?.focus();
  }

  return (
    <div className="landingWrap">
      <AuthTopBar />

      <section className="landingHero">
        <h1>Welcome back.</h1>
        <p>Your one link, always exactly where you left it.</p>
        <ExploreLiveLink />

        {/* calm variant: spec §16 — "your home is waiting for you," no
            hover expansion or pointer parallax, just the idle motion. */}
        <DigitalHomeVisual variant="calm" onProfileActivate={focusIdentifier} />
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

          {/* prefetch={false}: this form mounts alongside DigitalHomeVisual's
              4 nodes, ExploreLiveLink, and MarketingNav — without it, this
              page view adds two more concurrent RSC prefetches to that same
              burst. Same DB-connection-burst-503 fix as those. */}
          <p className="authFooter">
            <Link href="/forgot-password" prefetch={false}>Forgot password?</Link>
          </p>
          <p className="authFooter">
            New here? <Link href="/signup" prefetch={false}>Create an account</Link>
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
