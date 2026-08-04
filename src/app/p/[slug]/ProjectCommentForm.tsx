"use client";

import { useActionState, useRef } from "react";
import { createProjectComment } from "@/app/actions/projects";

// Mirrors ReplyForm.tsx (src/app/feed/ReplyForm.tsx) exactly — same
// reset-on-submit shape, applied to ProjectComment instead of Post.
export function ProjectCommentForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createProjectComment, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <textarea name="body" placeholder="Add a comment" maxLength={1000} rows={2} required className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
