"use client";

import { useActionState, useRef } from "react";
import { createPost } from "@/app/actions/posts";

export function ComposeBox() {
  const [state, formAction, pending] = useActionState(createPost, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="authCard"
      style={{ maxWidth: "none", marginBottom: "1.5rem" }}
    >
      <textarea
        name="body"
        placeholder="What's happening?"
        maxLength={500}
        rows={3}
        required
        className="textInput"
      />
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
