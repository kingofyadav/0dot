"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { signup, login } from "@/app/actions/auth";
import { ThemeToggleLogo } from "./ThemeToggleLogo";
import { AuthTrust } from "./AuthTrust";
import { Skeleton } from "./Skeleton";

// Lazy rather than static imports: this is the landing page's LCP element
// (the "Create your account" <h1> just below lives in the same tree), and
// Lighthouse traced ~2.4s of "element render delay" on it — not network, the
// main thread staying busy parsing/executing/hydrating these three pieces
// (password-strength scoring, the debounced username-availability checker,
// and a ~195-entry country list) before the browser got a free slot to paint
// the already-server-rendered heading. next/dynamic's default ssr:true keeps
// them in the server HTML (no content flash, nothing lost for no-JS/SEO) but
// splits their JS into separate chunks behind a Suspense boundary, so
// selective hydration can commit the h1/shell without waiting on them.
const PasswordField = dynamic(() => import("./PasswordField").then((m) => m.PasswordField), {
  loading: () => <FieldSkeleton />,
});
const UsernameField = dynamic(() => import("./UsernameField").then((m) => m.UsernameField), {
  loading: () => <FieldSkeleton />,
});
const CountryCodeSelect = dynamic(() => import("./CountryCodeSelect").then((m) => m.CountryCodeSelect), {
  loading: () => <Skeleton height="2.7rem" width="6rem" style={{ flex: "0 0 auto", display: "block" }} />,
});

// Matches the label + input shape PasswordField/UsernameField each render
// inside their own .field wrapper (see globals.css's `.field input` rule for
// the 2.7rem-ish height) — only reached if the chunk genuinely isn't ready
// yet, since ssr:true means the real markup is already in the server HTML.
function FieldSkeleton() {
  return (
    <div className="field" aria-hidden="true">
      <Skeleton height="0.85rem" width="30%" style={{ marginBottom: "0.4rem" }} />
      <Skeleton height="2.7rem" style={{ display: "block" }} />
    </div>
  );
}

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
              name="hp_extra_field"
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
                <CountryCodeSelect />
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

          {/* prefetch={false}: this renders on the landing page alongside
              DigitalHomeVisual/ExploreLiveLink/MarketingNav — same
              DB-connection-burst-503 fix as those. */}
          <p className="authFooter">
            <Link href="/forgot-password" prefetch={false}>Forgot password?</Link>
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
