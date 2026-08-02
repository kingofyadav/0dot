"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  // Controlled, unlike the password field below — a failed submit (server
  // action + form reset) shouldn't force retyping the email too, only the
  // password that was actually wrong.
  const [email, setEmail] = useState("");

  return (
    <div className="authWrap">
      <form action={formAction} className="authCard">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <Logo size={48} />
          <p style={{ fontWeight: 600 }}>Welcome</p>
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
      </form>
    </div>
  );
}
