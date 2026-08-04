"use client";

import { useActionState } from "react";
import { createCourse, updateCourse } from "@/app/actions/courses";

// spec §11: owner-only course create/edit, same shape as TierForm.tsx.
// requiredTierId offers only the creator's own tiers (server-validated
// regardless, see courses.ts's parseAndValidateCourseFields).
export function CourseForm({
  course,
  ownTiers,
}: {
  course?: { id: string; title: string; description: string; price: number | null; currency: string | null; requiredTierId: string | null; status: string };
  ownTiers: { id: string; name: string }[];
}) {
  const action = course ? updateCourse : createCourse;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = course?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      {course && <input type="hidden" name="courseId" value={course.id} />}
      <div className="field">
        <label htmlFor={`courseTitle-${idSuffix}`}>Title</label>
        <input id={`courseTitle-${idSuffix}`} name="title" defaultValue={course?.title} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`courseDescription-${idSuffix}`}>Description</label>
        <textarea id={`courseDescription-${idSuffix}`} name="description" defaultValue={course?.description} maxLength={2000} rows={2} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`coursePrice-${idSuffix}`}>Price (optional)</label>
          <input id={`coursePrice-${idSuffix}`} name="price" type="number" min="0.01" step="0.01" defaultValue={course?.price ?? undefined} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`courseCurrency-${idSuffix}`}>Currency</label>
          <input id={`courseCurrency-${idSuffix}`} name="currency" defaultValue={course?.currency ?? "usd"} maxLength={3} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`courseTier-${idSuffix}`}>Bundle into a membership tier (optional)</label>
        <select id={`courseTier-${idSuffix}`} name="requiredTierId" defaultValue={course?.requiredTierId ?? ""} className="textInput">
          <option value="">No tier bundle</option>
          {ownTiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {course && (
        <div className="field">
          <label htmlFor={`courseStatus-${idSuffix}`}>Status</label>
          <select id={`courseStatus-${idSuffix}`} name="status" defaultValue={course.status} className="textInput">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : course ? "Save changes" : "Create course"}
      </button>
    </form>
  );
}
