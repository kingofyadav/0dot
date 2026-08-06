"use client";

import { useActionState, useState } from "react";
import { createForm, type FormFieldDef } from "@/app/actions/forms";

type DraftField = FormFieldDef & { optionsText?: string };

const EMPTY_FIELD: DraftField = { label: "", type: "text", required: false };

export function FormBuilder() {
  const [state, formAction, pending] = useActionState(createForm, undefined);
  const [fields, setFields] = useState<DraftField[]>([{ ...EMPTY_FIELD }]);

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  const fieldsJson = JSON.stringify(
    fields
      .filter((f) => f.label.trim().length > 0)
      .map((f) => ({
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.type === "choice" ? (f.optionsText ?? "").split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      }))
  );

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "520px" }}>
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={160} className="textInput" />
      </div>
      <div>
        <label htmlFor="mode">Mode</label>
        <select id="mode" name="mode" defaultValue="form" className="textInput">
          <option value="form">Form</option>
          <option value="survey">Survey</option>
        </select>
      </div>

      <p className="sectionHeading">Fields</p>
      {fields.map((field, index) => (
        <div key={index} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Field label"
            value={field.label}
            onChange={(e) => updateField(index, { label: e.target.value })}
            className="textInput"
            style={{ flex: "2 1 140px" }}
          />
          <select value={field.type} onChange={(e) => updateField(index, { type: e.target.value })} className="textInput" style={{ flex: "1 1 100px" }}>
            <option value="text">Text</option>
            <option value="choice">Choice</option>
            <option value="rating">Rating</option>
            <option value="date">Date</option>
          </select>
          {field.type === "choice" && (
            <input
              placeholder="Options, comma-separated"
              value={field.optionsText ?? ""}
              onChange={(e) => updateField(index, { optionsText: e.target.value })}
              className="textInput"
              style={{ flex: "2 1 160px" }}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.85rem" }}>
            <input type="checkbox" checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} />
            Required
          </label>
          <button type="button" className="button buttonSecondary buttonSmall" onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="button buttonSecondary buttonSmall" style={{ alignSelf: "flex-start" }} onClick={() => setFields((prev) => [...prev, { ...EMPTY_FIELD }])}>
        + Add field
      </button>

      <input type="hidden" name="fieldsJson" value={fieldsJson} />
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
