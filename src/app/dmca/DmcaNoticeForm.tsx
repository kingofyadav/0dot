"use client";

import { useActionState, useRef, useState } from "react";
import { fileDmcaTakedownNoticeAction } from "@/app/actions/dmca";

const SUBJECT_TYPES = [
  { value: "post", label: "Post" },
  { value: "article", label: "Article" },
  { value: "comment", label: "Comment" },
  { value: "marketplace_listing", label: "Marketplace listing" },
];

// phase-13 spec §4.1: the formal, statute-shaped notice — every field here
// maps to a specific 17 U.S.C. § 512(c)(3) requirement. The two checkboxes
// are the statutory attestations; their exact legal wording is legal's to
// draft (§9's engineering-can't-invent-this note), so the copy below is a
// plain-language placeholder pending that review.
export function DmcaNoticeForm() {
  const [state, formAction, pending] = useActionState(fileDmcaTakedownNoticeAction, undefined);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (submitted && !state?.error) {
    return <p className="profileCard">Notice submitted. Trust &amp; Safety staff will review it.</p>;
  }

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        setSubmitted(true);
      }}
      className="profileCard"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <label>
        Your name
        <input type="text" name="complainantName" className="textInput" required />
      </label>
      <label>
        Your contact information (email or address)
        <input type="text" name="complainantContact" className="textInput" required />
      </label>
      <p className="mutedText" style={{ fontSize: "0.8rem" }}>
        This contact information will be disclosed to the account whose content you&apos;re reporting, if they
        file a counter-notice — this is a statutory requirement, not optional.
      </p>
      <label>
        Description of the copyrighted work being infringed
        <textarea name="copyrightedWorkDescription" className="textInput" rows={3} required />
      </label>
      <label>
        Content type
        <select name="infringingContentSubjectType" className="textInput" required defaultValue="">
          <option value="" disabled>
            Select one
          </option>
          {SUBJECT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        ID of the infringing content
        <input type="text" name="infringingContentSubjectId" className="textInput" required />
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <input type="checkbox" name="goodFaithStatementAccepted" required />
        <span>
          I have a good faith belief that use of the material in the manner complained of is not authorized by
          the copyright owner, its agent, or the law.
        </span>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <input type="checkbox" name="accuracyPerjuryStatementAccepted" required />
        <span>
          Under penalty of perjury, I state that the information in this notice is accurate and that I am the
          copyright owner or authorized to act on their behalf.
        </span>
      </label>
      <label>
        Signature (type your full legal name)
        <input type="text" name="signature" className="textInput" required />
      </label>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Submitting…" : "Submit notice"}
      </button>
    </form>
  );
}
