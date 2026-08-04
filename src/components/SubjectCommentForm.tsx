"use client";

import { useActionState, useRef } from "react";
import { createComment } from "@/app/actions/reactions";

// Generic version of ArticleCommentForm.tsx, for the three subject types
// (wiki_page/book/published_file) wired after Article — same reset-on-
// submit shape, parameterized by subjectType/subjectId instead of a
// dedicated articleId field.
export function SubjectCommentForm({ subjectType, subjectId }: { subjectType: string; subjectId: string }) {
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
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
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
