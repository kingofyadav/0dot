"use client";

import { useActionState, useRef } from "react";
import { createJobAlert } from "@/app/actions/job-alerts";

export function JobAlertForm() {
  const [state, formAction, pending] = useActionState(createJobAlert, undefined);
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
      <input name="keywords" placeholder="Keywords" className="textInput" style={{ flex: "2 1 160px" }} />
      <input name="location" placeholder="Location" className="textInput" style={{ flex: "1 1 140px" }} />
      <select name="employmentType" defaultValue="" className="textInput" style={{ flex: "1 1 140px" }}>
        <option value="">Any type</option>
        <option value="full_time">Full-time</option>
        <option value="part_time">Part-time</option>
        <option value="contract">Contract</option>
        <option value="internship">Internship</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <input type="checkbox" name="remote" value="true" />
        Remote only
      </label>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save alert"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
