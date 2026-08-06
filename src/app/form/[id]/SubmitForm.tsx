"use client";

import { useActionState } from "react";
import { submitFormResponse, type FormFieldDef, type FormSubmitState } from "@/app/actions/forms";

function FieldInput({ field }: { field: FormFieldDef }) {
  if (field.type === "choice") {
    return (
      <select name={field.label} required={field.required} className="textInput">
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }
  if (field.type === "rating") {
    return (
      <select name={field.label} required={field.required} className="textInput">
        <option value="">Select…</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    );
  }
  if (field.type === "date") {
    return <input name={field.label} type="date" required={field.required} className="textInput" />;
  }
  return <input name={field.label} type="text" required={field.required} maxLength={2000} className="textInput" />;
}

export function SubmitForm({ formId, fields }: { formId: string; fields: FormFieldDef[] }) {
  const [state, formAction, pending] = useActionState<FormSubmitState, FormData>(submitFormResponse, undefined);

  if (state && "success" in state) {
    return <p>Thanks — your response was recorded.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "480px" }}>
      <input type="hidden" name="formId" value={formId} />
      {fields.map((field) => (
        <div key={field.label}>
          <label>{field.label}{field.required && " *"}</label>
          <FieldInput field={field} />
        </div>
      ))}
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Submitting…" : "Submit"}
      </button>
      {state && "error" in state && <p className="errorText">{state.error}</p>}
    </form>
  );
}
