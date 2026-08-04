"use client";

import { useActionState } from "react";
import { createIssue, updateIssue } from "@/app/actions/newsletter";

export function NewsletterIssueForm({
  issue,
  ownTiers,
}: {
  issue?: { id: string; subject: string; body: string; requiredTierId: string | null };
  ownTiers: { id: string; name: string }[];
}) {
  const action = issue ? updateIssue : createIssue;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = issue?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36ch" }}>
      {issue && <input type="hidden" name="issueId" value={issue.id} />}
      <div className="field">
        <label htmlFor={`issueSubject-${idSuffix}`}>Subject</label>
        <input id={`issueSubject-${idSuffix}`} name="subject" defaultValue={issue?.subject} maxLength={150} required />
      </div>
      <div className="field">
        <label htmlFor={`issueBody-${idSuffix}`}>Body</label>
        <textarea id={`issueBody-${idSuffix}`} name="body" defaultValue={issue?.body} rows={6} required />
      </div>
      <div className="field">
        <label htmlFor={`issueTier-${idSuffix}`}>Paid subscribers only (optional)</label>
        <select id={`issueTier-${idSuffix}`} name="requiredTierId" defaultValue={issue?.requiredTierId ?? ""} className="textInput">
          <option value="">Everyone</option>
          {ownTiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name} and up</option>
          ))}
        </select>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : issue ? "Save changes" : "Save draft"}
      </button>
    </form>
  );
}
