"use client";

import { useActionState } from "react";
import { applyToJob } from "@/app/actions/jobs";

// applyToJob has no success flag (see reviews.ts's identical shape) —
// revalidatePath on the job's own path re-renders JobDetailPage's server
// component with the new application, so its "already applied" branch
// takes over on the next render without this form tracking success itself.
export function ApplyForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(applyToJob, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <textarea name="coverNote" placeholder="Cover note (optional)" maxLength={3000} rows={4} className="textInput" />
      <label className="mutedText" style={{ fontSize: "0.8rem" }}>
        Resume (optional)
      </label>
      <input type="file" name="resume" accept=".pdf,.txt,image/png,image/jpeg,image/webp,image/gif" className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Applying…" : "Apply"}
      </button>
    </form>
  );
}
