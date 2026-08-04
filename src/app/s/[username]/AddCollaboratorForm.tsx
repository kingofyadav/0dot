"use client";

import { useActionState } from "react";
import { addCollaborator } from "@/app/actions/projects";

export function AddCollaboratorForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(addCollaborator, undefined);

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "flex-end" }}>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="field">
        <label>Handle (registered user)</label>
        <input name="handle" placeholder="username" className="textInput" />
      </div>
      <div className="field">
        <label>or display name</label>
        <input name="displayName" placeholder="No 0dot account" className="textInput" />
      </div>
      <div className="field">
        <label>Role</label>
        <input name="role" placeholder="Designer" maxLength={60} className="textInput" />
      </div>
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add collaborator"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
