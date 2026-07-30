"use client";

import { useActionState } from "react";
import { claimUsername } from "@/app/actions/profile";
import { Logo } from "@/components/Logo";

export default function ClaimUsernamePage() {
  const [state, formAction, pending] = useActionState(claimUsername, undefined);

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
          <p style={{ fontWeight: 600 }}>Almost there</p>
        </div>
        <h1>Claim your username</h1>
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

        {state?.error && <p className="errorText">{state.error}</p>}

        <button type="submit" className="button" disabled={pending}>
          {pending ? "Claiming…" : "Claim username"}
        </button>
      </form>
    </div>
  );
}
