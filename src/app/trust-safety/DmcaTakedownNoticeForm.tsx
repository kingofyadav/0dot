"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { fileDmcaTakedownNoticeAction } from "@/app/actions/dmca";
import { Icon } from "@/components/Icon";

// phase-13 spec §4.1/§4.4's unauthenticated takedown-notice path
// (fileDmcaTakedownNoticeAction) had no page rendering it anywhere in the
// app — a rights holder had no way to actually file a notice despite Terms
// and this page both describing the process. This is that missing surface.
export function DmcaTakedownNoticeForm() {
  const [state, formAction, pending] = useActionState(fileDmcaTakedownNoticeAction, undefined);

  if (state?.success) {
    return (
      <p className="aboutCard" style={{ flexDirection: "row", alignItems: "center", gap: "0.6rem" }}>
        <Icon as={CheckCircle2} size="md" />
        Notice received. We&rsquo;ll review it and act within our DMCA process — you don&rsquo;t need to do
        anything further unless we contact you.
      </p>
    );
  }

  return (
    <form action={formAction} className="stack" style={{ maxWidth: "48ch" }}>
      <div className="field">
        <label htmlFor="dmcaName">Your full legal name</label>
        <input id="dmcaName" name="complainantName" className="textInput" required />
      </div>
      <div className="field">
        <label htmlFor="dmcaContact">Email or postal address we can reach you at</label>
        <input id="dmcaContact" name="complainantContact" className="textInput" required />
      </div>
      <div className="field">
        <label htmlFor="dmcaWork">The copyrighted work being infringed</label>
        <textarea id="dmcaWork" name="copyrightedWorkDescription" className="textInput" rows={3} required />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor="dmcaSubjectType">What kind of content is it?</label>
          <select id="dmcaSubjectType" name="infringingContentSubjectType" className="textInput" defaultValue="post" required>
            <option value="post">Post</option>
            <option value="article">Article</option>
            <option value="comment">Comment</option>
            <option value="marketplace_listing">Marketplace listing</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="dmcaLocation">Direct link to it on 0dot.in</label>
          <input id="dmcaLocation" name="infringingContentLocation" className="textInput" placeholder="https://0dot.in/…" required />
        </div>
      </div>
      <label className="checkboxField">
        <input type="checkbox" name="goodFaithStatementAccepted" required />
        <span>
          I have a good faith belief the use described above is not authorized by the copyright owner, its
          agent, or the law.
        </span>
      </label>
      <label className="checkboxField">
        <input type="checkbox" name="accuracyPerjuryStatementAccepted" required />
        <span>
          Under penalty of perjury, the information in this notice is accurate, and I am the copyright owner
          or authorized to act on their behalf.
        </span>
      </label>
      <div className="field">
        <label htmlFor="dmcaSignature">Signature (type your full legal name)</label>
        <input id="dmcaSignature" name="signature" className="textInput" required />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Submitting…" : "Submit takedown notice"}
      </button>
    </form>
  );
}
