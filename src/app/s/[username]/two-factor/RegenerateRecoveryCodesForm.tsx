"use client";

import { useState } from "react";
import { regenerateRecoveryCodes } from "@/app/actions/two-factor";
import { PasswordField } from "@/components/PasswordField";

// Same "call the server action directly, not via useActionState" reasoning
// as TwoFactorSetupForm's confirm step — the new codes need to come back as
// data, shown once, not just an error/success flag.
export function RegenerateRecoveryCodesForm() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("currentPassword") ?? "");
    setPending(true);
    setError(null);
    const result = await regenerateRecoveryCodes(password);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCodes(result.recoveryCodes);
  }

  if (codes) {
    return (
      <div className="authCard" style={{ maxWidth: "none" }}>
        <p className="mutedText">
          Your old recovery codes no longer work. Save these new ones somewhere safe — they won&apos;t be shown again.
        </p>
        <ul style={{ fontFamily: "monospace", listStyle: "none", padding: 0 }}>
          {codes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="authCard" style={{ maxWidth: "none" }}>
      <PasswordField
        id="regen-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        required
      />
      {error && <p className="errorText">{error}</p>}
      <button type="submit" className="button buttonSecondary" disabled={pending}>
        {pending ? "Generating…" : "Generate new recovery codes"}
      </button>
    </form>
  );
}
