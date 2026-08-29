"use client";

import { useActionState } from "react";
import { createLearningPath } from "@/app/actions/learning-paths";

export function LearningPathForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(createLearningPath, undefined);

  return (
    <form action={formAction} className="settingsForm">
      <input name="title" placeholder="Learning path title" required maxLength={160} className="textInput" />
      <p className="mutedText" style={{ fontSize: "0.85rem", margin: 0 }}>Select courses, in order:</p>
      <select name="courseIds" multiple size={Math.min(6, Math.max(3, courses.length))} className="textInput">
        {courses.map((course) => (
          <option key={course.id} value={course.id}>{course.title}</option>
        ))}
      </select>
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create learning path"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
