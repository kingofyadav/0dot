"use client";

import { useActionState, useState } from "react";
import { editPost } from "@/app/actions/posts";

// phase-13 spec §3.3: the UI entry point for the editPost action —
// collapsed by default (same disclosure pattern as QuoteRepostForm), since
// most posts are never edited and this shouldn't add visual weight to
// every post's owner controls.
export function EditPostForm({ postId, body }: { postId: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(editPost, undefined);

  if (!open) {
    return (
      <button type="button" className="linkButton" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <form
      action={async (formData: FormData) => {
        await formAction(formData);
        setOpen(false);
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}
    >
      <input type="hidden" name="postId" value={postId} />
      <textarea name="body" defaultValue={body} maxLength={500} rows={3} required className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="linkButton" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
