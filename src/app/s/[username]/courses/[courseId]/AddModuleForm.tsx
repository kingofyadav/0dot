"use client";

import { useActionState } from "react";
import { createModule } from "@/app/actions/courses";

export function AddModuleForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(createModule, undefined);

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: "40ch" }}>
      <input type="hidden" name="courseId" value={courseId} />
      <div className="field" style={{ flex: 1 }}>
        <label htmlFor={`newModuleTitle-${courseId}`}>New module title</label>
        <input id={`newModuleTitle-${courseId}`} name="title" maxLength={120} required />
      </div>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Adding…" : "Add module"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
