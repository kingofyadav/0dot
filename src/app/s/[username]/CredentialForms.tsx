"use client";

import { useActionState, useRef } from "react";
import { addResearchPaper, addCertificate, addAward } from "@/app/actions/credentials";

export function ResearchPaperForm({ ownProjects }: { ownProjects: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(addResearchPaper, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="settingsForm"
    >
      <div className="field">
        <label htmlFor="paperTitle">Title</label>
        <input id="paperTitle" name="title" maxLength={300} required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="paperAuthors">Authors</label>
        <input id="paperAuthors" name="authors" placeholder="A. Smith, B. Jones" required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="paperVenue">Venue</label>
        <input id="paperVenue" name="venue" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="paperPublishDate">Publish date</label>
        <input id="paperPublishDate" name="publishDate" type="date" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="paperDoi">DOI or URL</label>
        <input id="paperDoi" name="doiOrUrl" type="url" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="paperFile">PDF (optional)</label>
        <input id="paperFile" name="file" type="file" accept="application/pdf" />
      </div>
      <div className="field">
        <label htmlFor="paperAbstract">Abstract</label>
        <textarea id="paperAbstract" name="abstract" maxLength={3000} rows={3} />
      </div>
      {ownProjects.length > 0 && (
        <div className="field">
          <label htmlFor="paperProject">Related project (optional)</label>
          <select id="paperProject" name="projectId" defaultValue="" className="textInput">
            <option value="">None</option>
            {ownProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add paper"}
      </button>
    </form>
  );
}

export function CertificateForm() {
  const [state, formAction, pending] = useActionState(addCertificate, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="settingsForm"
    >
      <div className="field">
        <label htmlFor="certTitle">Title</label>
        <input id="certTitle" name="title" maxLength={150} required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="certIssuingOrg">Issuing organization</label>
        <input id="certIssuingOrg" name="issuingOrg" maxLength={150} required className="textInput" />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor="certIssueDate">Issue date</label>
          <input id="certIssueDate" name="issueDate" type="date" required className="textInput" />
        </div>
        <div className="field">
          <label htmlFor="certExpiryDate">Expiry date</label>
          <input id="certExpiryDate" name="expiryDate" type="date" className="textInput" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="certCredentialId">Credential ID</label>
        <input id="certCredentialId" name="credentialId" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="certCredentialUrl">Verification link</label>
        <input id="certCredentialUrl" name="credentialUrl" type="url" placeholder="e.g. a Credly badge page" className="textInput" />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add certificate"}
      </button>
    </form>
  );
}

export function AwardForm() {
  const [state, formAction, pending] = useActionState(addAward, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="settingsForm"
    >
      <div className="field">
        <label htmlFor="awardTitle">Title</label>
        <input id="awardTitle" name="title" maxLength={150} required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="awardIssuingOrg">Issuing organization</label>
        <input id="awardIssuingOrg" name="issuingOrg" className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="awardedDate">Awarded date</label>
        <input id="awardedDate" name="awardedDate" type="date" required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="awardDescription">Description</label>
        <textarea id="awardDescription" name="description" maxLength={1000} rows={2} />
      </div>
      <div className="field">
        <label htmlFor="awardLink">Link</label>
        <input id="awardLink" name="link" type="url" className="textInput" />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add award"}
      </button>
    </form>
  );
}
