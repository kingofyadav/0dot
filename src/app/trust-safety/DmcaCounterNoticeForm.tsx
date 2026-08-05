"use client";

import { useActionState } from "react";
import { fileDmcaCounterNoticeAction } from "@/app/actions/dmca";

type CounterNotice = { status: string; restorationEligibleAt: Date } | null;

// phase-13 spec §4.2/§4.5: only offered once the notice actually removed
// content (status === "content_removed") — a still-pending or already-
// rejected notice has nothing to counter yet.
export function DmcaCounterNoticeForm({
  noticeId,
  noticeStatus,
  counterNotice,
}: {
  noticeId: string;
  noticeStatus: string;
  counterNotice: CounterNotice;
}) {
  const [state, formAction, pending] = useActionState(fileDmcaCounterNoticeAction, undefined);

  if (counterNotice) {
    return (
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        Counter-notice {counterNotice.status === "received" ? `submitted — eligible for restoration on ${counterNotice.restorationEligibleAt.toLocaleDateString()} unless the complainant files suit` : counterNotice.status.replace("_", " ")}
      </p>
    );
  }

  if (noticeStatus !== "content_removed") {
    return (
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        {noticeStatus === "invalid_rejected" ? "This notice was rejected; no action needed." : "This notice is still under review."}
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: "100%", maxWidth: "48ch" }}>
      <input type="hidden" name="originalNoticeId" value={noticeId} />
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.85rem" }}>
        <input type="checkbox" name="goodFaithStatementAccepted" required />
        <span>I have a good faith belief the material was removed as a result of a mistake or misidentification.</span>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.85rem" }}>
        <input type="checkbox" name="consentToJurisdiction" required />
        <span>I consent to the jurisdiction of the applicable federal court and will accept service of process.</span>
      </label>
      <input type="text" name="signature" className="textInput" placeholder="Signature (your full legal name)" required />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Submitting…" : "File counter-notice"}
      </button>
    </form>
  );
}
