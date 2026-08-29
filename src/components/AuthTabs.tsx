"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, login } from "@/app/actions/auth";
import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { AuthTrust } from "./AuthTrust";
import { PasswordField } from "./PasswordField";
import { UsernameField } from "./UsernameField";
import { COUNTRY_CODES } from "@/lib/country-codes";

export function AuthTabs() {
  const [tab, setTab] = useState<"signup" | "login">("signup");
  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    undefined
  );
  const [loginState, loginAction, loginPending] = useActionState(
    login,
    undefined
  );
  // Controlled, unlike the login password field below — a failed submit
  // shouldn't force retyping the identifier too, only the password that was
  // actually wrong.
  const [loginIdentifier, setLoginIdentifier] = useState("");

  return (
    <div className="authCard">
      <div className="authHeader">
        <ThemeToggleLogo size={48} />
        <p>Welcome</p>
      </div>

      {tab === "signup" ? (
        <div className="authTabPanel" key="signup">
          <h1>Create your account</h1>
          <form
            action={signupAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
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
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <PasswordField
              id="signup-password"
              name="password"
              label="Password"
              autoComplete="new-password"
              minLength={8}
              required
              showStrength
            />

            <div className="field">
              <label htmlFor="signup-phoneNumber">Mobile number</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  id="signup-phoneDialCode"
                  name="phoneDialCode"
                  autoComplete="tel-country-code"
                  defaultValue="91"
                  aria-label="Country dial code"
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
                  id="signup-phoneNumber"
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
              <label htmlFor="signup-dateOfBirth">Date of birth</label>
              <input
                id="signup-dateOfBirth"
                name="dateOfBirth"
                type="date"
                autoComplete="bday"
                required
              />
            </div>

            {signupState?.error && (
              <p className="errorText">{signupState.error}</p>
            )}

            <button type="submit" className="button" disabled={signupPending}>
              {signupPending ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="authFooter">
            Already have an account?{" "}
            <button type="button" className="linkButton" onClick={() => setTab("login")}>
              Log in
            </button>
          </p>
        </div>
      ) : (
        <div className="authTabPanel" key="login">
          <h1>Log in</h1>
          <form
            action={loginAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div className="field">
              <label htmlFor="login-identifier">Email, username, or mobile number</label>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
              />
            </div>

            <PasswordField
              id="login-password"
              name="password"
              label="Password"
              autoComplete="current-password"
              required
            />

            {loginState?.error && (
              <p className="errorText">{loginState.error}</p>
            )}

            <button type="submit" className="button" disabled={loginPending}>
              {loginPending ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="authFooter">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <p className="authFooter">
            New here?{" "}
            <button type="button" className="linkButton" onClick={() => setTab("signup")}>
              Create an account
            </button>
          </p>
        </div>
      )}

      <AuthTrust />
    </div>
  );
}
