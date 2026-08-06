"use client";

import { useActionState, useRef } from "react";
import { createManualContact } from "@/app/actions/crm";

export function NewContactForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(createManualContact, undefined);
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
      <input type="hidden" name="businessId" value={businessId} />
      <input name="externalName" placeholder="Name" className="textInput" style={{ flex: "1 1 140px" }} />
      <input name="externalEmail" type="email" placeholder="Email" className="textInput" style={{ flex: "1 1 140px" }} />
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add contact"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
