"use client";

import { useActionState, useRef } from "react";
import { createPost } from "@/app/actions/posts";

export function ReplyForm({ replyToId }: { replyToId: string }) {
  const [state, formAction, pending] = useActionState(createPost, undefined);
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
      <input type="hidden" name="replyToId" value={replyToId} />
      <textarea
        name="body"
        placeholder="Post your reply"
        maxLength={500}
        rows={2}
        required
        className="textInput"
      />
      {state?.error && <p className="errorText">{state.error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Replying…" : "Reply"}
        </button>
      </div>
    </form>
  );
}
