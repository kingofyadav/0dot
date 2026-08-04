"use client";

import { useActionState, useRef } from "react";
import { addGitRepository } from "@/app/actions/git-repositories";

export function GitRepositoryForm({ ownProjects }: { ownProjects: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(addGitRepository, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}
    >
      <div className="field">
        <label htmlFor="repoProvider">Provider</label>
        <select id="repoProvider" name="provider" defaultValue="github" className="textInput">
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
          <option value="bitbucket">Bitbucket</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="repoUrl">Repository URL</label>
        <input id="repoUrl" name="url" type="url" placeholder="https://github.com/owner/repo" required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="repoDisplayName">Name</label>
        <input id="repoDisplayName" name="displayName" maxLength={100} required className="textInput" />
      </div>
      <div className="field">
        <label htmlFor="repoDescription">Description</label>
        <input id="repoDescription" name="description" className="textInput" />
      </div>
      {ownProjects.length > 0 && (
        <div className="field">
          <label htmlFor="repoProject">Attach to a project (optional)</label>
          <select id="repoProject" name="projectId" defaultValue="" className="textInput">
            <option value="">Standalone</option>
            {ownProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add repository"}
      </button>
    </form>
  );
}
