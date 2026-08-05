"use client";

import { useActionState, useState } from "react";
import { signup, login } from "@/app/actions/auth";
import { Logo } from "./Logo";
import { AuthTrust } from "./AuthTrust";

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
  // shouldn't force retyping the email too, only the password that was
  // actually wrong.
  const [loginEmail, setLoginEmail] = useState("");

  return (
    <div className="authCard">
      <div className="authHeader">
        <Logo size={48} />
        <p>Welcome</p>
      </div>

      {tab === "signup" ? (
        <>
          <h1>Create your account</h1>
          <p className="mutedText" style={{ textAlign: "center", marginTop: "-0.75rem" }}>
            One identity. One profile.
          </p>
          <form
            action={signupAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
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
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
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
        </>
      ) : (
        <>
          <h1>Log in</h1>
          <form
            action={loginAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {loginState?.error && (
              <p className="errorText">{loginState.error}</p>
            )}

            <button type="submit" className="button" disabled={loginPending}>
              {loginPending ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="authFooter">
            New here?{" "}
            <button type="button" className="linkButton" onClick={() => setTab("signup")}>
              Create an account
            </button>
          </p>
        </>
      )}

      <AuthTrust />
    </div>
  );
}
