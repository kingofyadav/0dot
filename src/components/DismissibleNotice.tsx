"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Generic, reusable banner for a one-off server-driven notice (e.g. "that
// link isn't available") that the visitor can dismiss without a reload.
// Deliberately takes only a plain message string, never anything that could
// distinguish *why* — see src/app/aff/[code]/route.ts and
// src/app/r/[linkId]/route.ts's anti-enumeration comment: the caller must
// never pass different copy for "never existed" vs "expired."
export function DismissibleNotice({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="mutedText"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.6rem 0.85rem",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        marginBottom: "1rem",
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="button buttonSecondary iconButton"
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
