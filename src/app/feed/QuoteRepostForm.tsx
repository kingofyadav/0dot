"use client";

import { useActionState, useRef } from "react";
import { createQuoteRepost } from "@/app/actions/posts";

export function QuoteRepostForm({
  postId,
  authorName,
  bodyPreview,
}: {
  postId: string;
  authorName: string;
  bodyPreview: string;
}) {
  const [state, formAction, pending] = useActionState(createQuoteRepost, undefined);
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
      <input type="hidden" name="postId" value={postId} />
      <textarea
        name="body"
        placeholder="Add a comment"
        maxLength={500}
        rows={2}
        required
        className="textInput"
      />
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        Quoting {authorName}: {bodyPreview}
      </p>
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Quote"}
        </button>
      </div>
    </form>
  );
}
