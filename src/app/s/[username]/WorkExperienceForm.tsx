"use client";

import { useActionState } from "react";
import { addWorkExperience, updateWorkExperience } from "@/app/actions/resume";

type WorkExperienceFormItem = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  startDate: Date;
  endDate: Date | null;
  description: string;
};

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function WorkExperienceForm({ item }: { item?: WorkExperienceFormItem }) {
  const action = item ? updateWorkExperience : addWorkExperience;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = item?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {item && <input type="hidden" name="workExperienceId" value={item.id} />}
      <div className="field">
        <label htmlFor={`weCompany-${idSuffix}`}>Company</label>
        <input id={`weCompany-${idSuffix}`} name="company" defaultValue={item?.company} maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor={`weTitle-${idSuffix}`}>Title</label>
        <input id={`weTitle-${idSuffix}`} name="title" defaultValue={item?.title} maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor={`weLocation-${idSuffix}`}>Location</label>
        <input id={`weLocation-${idSuffix}`} name="location" defaultValue={item?.location ?? ""} />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`weStart-${idSuffix}`}>Start date</label>
          <input id={`weStart-${idSuffix}`} name="startDate" type="date" defaultValue={toDateInputValue(item?.startDate ?? null)} required />
        </div>
        <div className="field">
          <label htmlFor={`weEnd-${idSuffix}`}>End date (blank = current)</label>
          <input id={`weEnd-${idSuffix}`} name="endDate" type="date" defaultValue={toDateInputValue(item?.endDate ?? null)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`weDescription-${idSuffix}`}>Description</label>
        <textarea id={`weDescription-${idSuffix}`} name="description" defaultValue={item?.description} maxLength={2000} rows={3} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : item ? "Save changes" : "Add work experience"}
      </button>
    </form>
  );
}
