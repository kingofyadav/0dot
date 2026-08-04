"use client";

import { useActionState, useRef } from "react";
import { createComment } from "@/app/actions/reactions";

// Mirrors ProjectCommentForm.tsx exactly, generalized to the subjectType/
// subjectId pair the shared Reaction/Comment primitive (spec §4) uses
// instead of a dedicated projectId field.
export function ArticleCommentForm({ articleId }: { articleId: string }) {
  const [state, formAction, pending] = useActionState(createComment, undefined);
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
      <input type="hidden" name="subjectType" value="article" />
      <input type="hidden" name="subjectId" value={articleId} />
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
