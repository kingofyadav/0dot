"use client";

import { useActionState } from "react";
import { addEducation, updateEducation } from "@/app/actions/resume";

type EducationFormItem = {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: Date;
  endDate: Date | null;
  description: string;
};

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function EducationForm({ item }: { item?: EducationFormItem }) {
  const action = item ? updateEducation : addEducation;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = item?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {item && <input type="hidden" name="educationId" value={item.id} />}
      <div className="field">
        <label htmlFor={`eduInstitution-${idSuffix}`}>Institution</label>
        <input id={`eduInstitution-${idSuffix}`} name="institution" defaultValue={item?.institution} maxLength={100} required />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`eduDegree-${idSuffix}`}>Degree</label>
          <input id={`eduDegree-${idSuffix}`} name="degree" defaultValue={item?.degree ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`eduField-${idSuffix}`}>Field of study</label>
          <input id={`eduField-${idSuffix}`} name="fieldOfStudy" defaultValue={item?.fieldOfStudy ?? ""} />
        </div>
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`eduStart-${idSuffix}`}>Start date</label>
          <input id={`eduStart-${idSuffix}`} name="startDate" type="date" defaultValue={toDateInputValue(item?.startDate ?? null)} required />
        </div>
        <div className="field">
          <label htmlFor={`eduEnd-${idSuffix}`}>End date</label>
          <input id={`eduEnd-${idSuffix}`} name="endDate" type="date" defaultValue={toDateInputValue(item?.endDate ?? null)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`eduDescription-${idSuffix}`}>Description</label>
        <textarea id={`eduDescription-${idSuffix}`} name="description" defaultValue={item?.description} maxLength={1000} rows={3} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : item ? "Save changes" : "Add education"}
      </button>
    </form>
  );
}
