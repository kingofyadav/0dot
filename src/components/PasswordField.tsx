"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
  // Signup's password field only — a login field has nothing to score
  // (the account's real password was chosen at signup time, not now).
  showStrength?: boolean;
};

const STRENGTH_LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"] as const;

// Deliberately simple heuristic (length + character-class variety), not an
// entropy estimate or a breached-password check — this is a nudge shown
// while typing, not the actual policy (the 8-char minLength/server-side
// check is what's enforced). Capped at 4 so a very long password with only
// one character class still reads as "Good", not "Strong".
function scorePassword(password: string): number {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

// Shared by every password input across the 3 logged-out entry points
// (AuthTabs.tsx, login/page.tsx, signup/page.tsx) — a plain <input
// type="password"> with no way to check what you just typed was the
// single biggest missing micro-interaction on these forms.
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  required,
  showStrength,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const toggleId = useId();
  const score = showStrength ? scorePassword(password) : 0;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="passwordFieldWrap">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          onChange={showStrength ? (e) => setPassword(e.target.value) : undefined}
        />
        <button
          type="button"
          className="passwordToggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          id={toggleId}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {showStrength && password.length > 0 && (
        <div className="passwordStrength" data-score={score}>
          <div className="passwordStrengthBars" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < score ? "filled" : ""} />
            ))}
          </div>
          <span className="passwordStrengthLabel">{STRENGTH_LABELS[score]}</span>
        </div>
      )}
    </div>
  );
}
