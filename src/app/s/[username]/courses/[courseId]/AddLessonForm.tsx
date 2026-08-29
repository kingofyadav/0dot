"use client";

import { useActionState, useState } from "react";
import { createLesson } from "@/app/actions/courses";

export function AddLessonForm({ moduleId }: { moduleId: string }) {
  const [state, formAction, pending] = useActionState(createLesson, undefined);
  const [contentType, setContentType] = useState("text");

  return (
    <form action={formAction} className="settingsForm">
      <input type="hidden" name="moduleId" value={moduleId} />
      <div className="field">
        <label htmlFor={`newLessonTitle-${moduleId}`}>New lesson title</label>
        <input id={`newLessonTitle-${moduleId}`} name="title" maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`newLessonType-${moduleId}`}>Content type</label>
        <select
          id={`newLessonType-${moduleId}`}
          name="contentType"
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="textInput"
        >
          <option value="text">Text</option>
          <option value="video">Video</option>
          <option value="download">Download</option>
        </select>
      </div>
      {contentType === "text" ? (
        <div className="field">
          <label htmlFor={`newLessonBody-${moduleId}`}>Lesson text</label>
          <textarea id={`newLessonBody-${moduleId}`} name="body" maxLength={20000} rows={3} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`newLessonFile-${moduleId}`}>File</label>
          <input id={`newLessonFile-${moduleId}`} name="file" type="file" />
        </div>
      )}
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add lesson"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
