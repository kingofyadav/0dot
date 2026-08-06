"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { AuthTrust } from "@/components/AuthTrust";
import { COUNTRY_CODES } from "@/lib/country-codes";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <div className="authWrap">
      <form action={formAction} className="authCard">
        <div className="authHeader">
          <Logo size={48} />
          <p>Welcome</p>
        </div>
        <h1>Create your account</h1>
        <p className="mutedText">One identity. One profile.</p>

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

        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="yourname"
            autoComplete="username"
            pattern="[a-zA-Z0-9_]{3,30}"
            minLength={3}
            maxLength={30}
            required
          />
          <span className="mutedText">0dot.in/yourname — this is permanent.</span>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

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
