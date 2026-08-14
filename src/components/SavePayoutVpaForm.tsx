"use client";

import { useActionState, useRef, useState } from "react";
import { savePayoutVpa } from "@/app/actions/wallet";

// Not in TS's lib.dom.d.ts yet — Chrome/Edge ship it natively, so this is a
// runtime feature-detect (typeof check below), not a polyfilled dependency.
type BarcodeDetectorLike = {
  detect(image: ImageBitmap): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function extractVpa(decodedText: string): string | null {
  const trimmed = decodedText.trim();
  if (trimmed.startsWith("upi://")) {
    try {
      return new URL(trimmed).searchParams.get("pa");
    } catch {
      return null;
    }
  }
  return trimmed;
}

// Lets a user fill the same VPA text field two ways: type it, or upload a
// photo of their own UPI QR code, decoded fully client-side via the
// browser's native Barcode Detection API — no image ever reaches the
// server, no new npm dependency. Falls back to text-only entry silently on
// browsers without BarcodeDetector.
export function SavePayoutVpaForm({ currentVpa }: { currentVpa: string | null }) {
  const [state, formAction, pending] = useActionState(savePayoutVpa, undefined);
  const [vpa, setVpa] = useState(currentVpa ?? "");
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanError(null);

    try {
      const bitmap = await createImageBitmap(file);
      const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      const extracted = codes[0] ? extractVpa(codes[0].rawValue) : null;
      if (extracted) {
        setVpa(extracted);
      } else {
        setScanError("Couldn't find a UPI address in that QR code — enter it manually instead.");
      }
    } catch {
      setScanError("Couldn't read that image — enter your UPI address manually instead.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <div className="field">
        <label htmlFor="vpa">Your UPI address</label>
        <input
          id="vpa"
          name="vpa"
          type="text"
          placeholder="name@bank"
          value={vpa}
          onChange={(event) => setVpa(event.target.value)}
          required
        />
      </div>
      {scanSupported && (
        <div className="field">
          <label htmlFor="vpaQrUpload">Or upload a photo of your UPI QR code</label>
          <input id="vpaQrUpload" ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} />
        </div>
      )}
      {scanError && <p className="errorText">{scanError}</p>}
      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Saved.</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save UPI address"}
      </button>
    </form>
  );
}
