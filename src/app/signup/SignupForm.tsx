"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { AuthTopBar } from "@/components/AuthTopBar";
import { AuthTrust } from "@/components/AuthTrust";
import { DigitalHomeVisual } from "@/components/DigitalHomeVisual";
import { ExploreLiveLink } from "@/components/ExploreLiveLink";
import { PasswordField } from "@/components/PasswordField";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";
import { UsernameField } from "@/components/UsernameField";
import { COUNTRY_CODES } from "@/lib/country-codes";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  // The "Profile" node has nothing to navigate to on a logged-out visitor
  // (spec §16 step-1 "identity node appears") — here on the actual signup
  // page, activating it jumps straight to the form's first field instead.
  function focusFirstField() {
    document.getElementById("displayName")?.focus();
  }

  return (
    <div className="landingWrap">
      <AuthTopBar />

      <section className="landingHero">
        <h1>Claim your permanent link.</h1>
        <p>0dot.in/yourname — one identity for everything you make.</p>
        <ExploreLiveLink />

        <DigitalHomeVisual variant="calm" onProfileActivate={focusFirstField} />
      </section>

      <form action={formAction} className="authCard">
        <div className="authHeader">
          <ThemeToggleLogo size={48} />
          <p>Welcome</p>
        </div>
        <h1>Create your account</h1>

        <input
          type="text"
          name="website"
          className="honeypotField"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <div className="field">
          <label htmlFor="displayName">Full name</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={50}
            required
          />
        </div>

        <UsernameField id="username" />

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <PasswordField
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          minLength={8}
          required
          showStrength
        />

        <div className="field">
          <label htmlFor="phoneNumber">Mobile number</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              id="phoneDialCode"
              name="phoneDialCode"
              autoComplete="tel-country-code"
              defaultValue="91"
              style={{ flex: "0 0 auto" }}
              required
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.iso} value={c.dialCode}>
                  {c.iso} +{c.dialCode}
                </option>
              ))}
            </select>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9876543210"
              style={{ flex: "1 1 0%", minWidth: 0 }}
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="dateOfBirth">Date of birth</label>
          <input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" required />
        </div>

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Creating account…" : "Sign up"}
        </button>

        <p className="authFooter">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
        <AuthTrust />
      </form>
    </div>
  );
}
