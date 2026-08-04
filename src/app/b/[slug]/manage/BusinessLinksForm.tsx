"use client";

import { useActionState, useRef } from "react";
import { createBusinessLink } from "@/app/actions/business-links";

// Mirrors AddLinkForm.tsx (src/app/s/[username]/AddLinkForm.tsx) exactly.
export function BusinessLinksForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(createBusinessLink, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          name="label"
          type="text"
          placeholder="Label"
          maxLength={80}
          required
          className="textInput"
          style={{ flex: "1 1 100px" }}
        />
        <input
          name="url"
          type="url"
          placeholder="https://…"
          required
          className="textInput"
          style={{ flex: "2 1 160px" }}
        />
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
