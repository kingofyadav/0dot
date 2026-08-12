"use client";

import { useState } from "react";
import { startTwoFactorEnrollment, confirmTwoFactorEnrollment } from "@/app/actions/two-factor";

type Step =
  | { name: "start" }
  | { name: "confirm"; qrDataUrl: string; otpauthUrl: string }
  | { name: "recovery-codes"; codes: string[] };

// Multi-step enrollment: QR → confirm code → show recovery codes once.
// Calls the server actions directly (not via useActionState) since each
// step needs data back (the QR image, then the recovery codes), not just an
// error/success flag — same reasoning documented on startTwoFactorEnrollment.
export function TwoFactorSetupForm() {
  const [step, setStep] = useState<Step>({ name: "start" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleStart() {
    setPending(true);
    setError(null);
    const result = await startTwoFactorEnrollment();
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStep({ name: "confirm", qrDataUrl: result.qrDataUrl, otpauthUrl: result.otpauthUrl });
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await confirmTwoFactorEnrollment(code);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStep({ name: "recovery-codes", codes: result.recoveryCodes });
  }

  if (step.name === "start") {
    return (
      <div className="authCard" style={{ maxWidth: "none" }}>
        <p className="mutedText">
          Two-factor authentication adds a second step to signing in — a 6-digit code from an
          authenticator app, in addition to your password.
        </p>
        {error && <p className="errorText">{error}</p>}
        <button type="button" className="button" onClick={handleStart} disabled={pending}>
          {pending ? "Starting…" : "Set up two-factor authentication"}
        </button>
      </div>
    );
  }

  if (step.name === "confirm") {
    return (
      <form onSubmit={handleConfirm} className="authCard" style={{ maxWidth: "none" }}>
        <p className="mutedText">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated per-enrollment, not a static asset next/image's loader pipeline is for. */}
        <img src={step.qrDataUrl} alt="Two-factor authentication QR code" width={200} height={200} />
        <p className="mutedText" style={{ wordBreak: "break-all" }}>
          Can&apos;t scan? Enter this manually: <code>{step.otpauthUrl}</code>
        </p>
        <label htmlFor="totp-code">
          Verification code
          <input
            id="totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        {error && <p className="errorText">{error}</p>}
        <button type="submit" className="button" disabled={pending || code.length !== 6}>
          {pending ? "Verifying…" : "Confirm and enable"}
        </button>
      </form>
    );
  }

  return (
    <div className="authCard" style={{ maxWidth: "none" }}>
      <p className="mutedText">
        Two-factor authentication is now enabled. Save these recovery codes somewhere safe — each one
        can be used once to sign in if you lose access to your authenticator app. They won&apos;t be shown again.
      </p>
      <ul style={{ fontFamily: "monospace", listStyle: "none", padding: 0 }}>
        {step.codes.map((recoveryCode) => (
          <li key={recoveryCode}>{recoveryCode}</li>
        ))}
      </ul>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Done
      </button>
    </div>
  );
}
