"use client";

import { useActionState } from "react";
import { uploadResumePdf, removeResumePdf } from "@/app/actions/resume";

// spec §6.3: offered alongside the generated resume view, not instead of
// it — this form only manages the optional PDF, the generated view itself
// has no owner-facing form (it's assembled read-only from other sections).
export function ResumePdfForm({ resumePdfUrl }: { resumePdfUrl: string | null }) {
  const [state, formAction, pending] = useActionState(uploadResumePdf, undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {resumePdfUrl && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          Current: <a href={resumePdfUrl} target="_blank" rel="noopener noreferrer">resume.pdf</a>
        </p>
      )}
      <form action={formAction} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end" }}>
        <input type="file" name="resumePdf" accept="application/pdf" required />
        <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
          {pending ? "Uploading…" : resumePdfUrl ? "Replace" : "Upload"}
        </button>
      </form>
      {state?.error && <p className="errorText">{state.error}</p>}
      {resumePdfUrl && (
        <form action={removeResumePdf}>
          <button type="submit" className="button buttonSecondary buttonSmall">Remove PDF</button>
        </form>
      )}
    </div>
  );
}
