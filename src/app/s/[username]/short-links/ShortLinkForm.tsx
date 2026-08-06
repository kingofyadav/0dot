"use client";

import { useActionState, useRef } from "react";
import { createShortLink } from "@/app/actions/short-links";

export function ShortLinkForm() {
  const [state, formAction, pending] = useActionState(createShortLink, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
    >
      <input
        name="destinationUrl"
        type="url"
        placeholder="https://…"
        required
        className="textInput"
        style={{ flex: "1 1 240px" }}
      />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Shortening…" : "Shorten"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
