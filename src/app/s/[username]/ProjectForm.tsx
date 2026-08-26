"use client";

import { useActionState, useState } from "react";
import { createProject, updateProject } from "@/app/actions/projects";

const MAX_LINKS = 10;

type ProjectFormProject = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  status: string;
  visibility: string;
  featuredOnResume: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  externalLinksJson: string | null;
  skillIds?: string[];
};

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

// spec §3: owner-only project create/edit, same shape as CourseForm.tsx.
// externalLinks use PollComposeForm's dynamic add/remove-row pattern (the
// only existing precedent in this codebase for a variable-length list of
// form inputs) rather than inventing a different one.
export function ProjectForm({ project, ownSkills = [] }: { project?: ProjectFormProject; ownSkills?: { id: string; name: string }[] }) {
  const action = project ? updateProject : createProject;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = project?.id ?? "new";

  const initialLinks: { label: string; url: string }[] = project?.externalLinksJson
    ? JSON.parse(project.externalLinksJson)
    : [];
  const [links, setLinks] = useState(initialLinks);

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
  function addLink() {
    setLinks((prev) => (prev.length >= MAX_LINKS ? prev : [...prev, { label: "", url: "" }]));
  }
  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36ch" }}>
      {project && <input type="hidden" name="projectId" value={project.id} />}
      {!project && (
        <div className="field">
          <label htmlFor={`projectSlug-${idSuffix}`}>Slug (0dot.in/p/…)</label>
          <input
            id={`projectSlug-${idSuffix}`}
            name="slug"
            maxLength={60}
            required
            pattern="[a-z0-9_]{3,60}"
            placeholder="your_project"
          />
          {/* Same shared validateSlugFormat pattern as usernames/articles/
              communities (src/lib/slug-validation.ts) — no hyphens, only
              letters/numbers/underscores. Spelled out here since the field
              previously gave no example at all, the same gap that made
              NewCommunityForm's old hyphenated placeholder actively
              misleading rather than just under-specified. */}
          <span className="mutedText">Letters, numbers, and underscores only.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor={`projectTitle-${idSuffix}`}>Title</label>
        <input id={`projectTitle-${idSuffix}`} name="title" defaultValue={project?.title} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`projectSummary-${idSuffix}`}>Summary</label>
        <input id={`projectSummary-${idSuffix}`} name="summary" defaultValue={project?.summary} maxLength={280} />
      </div>
      <div className="field">
        <label htmlFor={`projectDescription-${idSuffix}`}>Description</label>
        <textarea id={`projectDescription-${idSuffix}`} name="description" defaultValue={project?.description} rows={5} />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`projectCover-${idSuffix}`}>Cover image</label>
          <input id={`projectCover-${idSuffix}`} name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>
        <div className="field">
          <label htmlFor={`projectGallery-${idSuffix}`}>Gallery (up to 12)</label>
          <input id={`projectGallery-${idSuffix}`} name="gallery" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`projectStarted-${idSuffix}`}>Started</label>
          <input id={`projectStarted-${idSuffix}`} name="startedAt" type="date" defaultValue={toDateInputValue(project?.startedAt ?? null)} />
        </div>
        <div className="field">
          <label htmlFor={`projectCompleted-${idSuffix}`}>Completed</label>
          <input id={`projectCompleted-${idSuffix}`} name="completedAt" type="date" defaultValue={toDateInputValue(project?.completedAt ?? null)} />
        </div>
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`projectStatus-${idSuffix}`}>Status</label>
          <select id={`projectStatus-${idSuffix}`} name="status" defaultValue={project?.status ?? "in_progress"} className="textInput">
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`projectVisibility-${idSuffix}`}>Visibility</label>
          <select id={`projectVisibility-${idSuffix}`} name="visibility" defaultValue={project?.visibility ?? "public"} className="textInput">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (direct link only)</option>
          </select>
        </div>
      </div>
      <label className="mutedText" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        <input type="checkbox" name="featuredOnResume" value="true" defaultChecked={project?.featuredOnResume} />
        Feature on resume
      </label>

      {ownSkills.length > 0 && (
        <div>
          <span className="mutedText" style={{ fontSize: "0.85rem" }}>Skills used</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.3rem" }}>
            {ownSkills.map((skill) => (
              <label key={skill.id} className="mutedText" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <input type="checkbox" name="skillIds" value={skill.id} defaultChecked={project?.skillIds?.includes(skill.id)} />
                {skill.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.3rem" }}>
        <span className="mutedText" style={{ fontSize: "0.85rem" }}>External links</span>
        {links.map((link, index) => (
          <div key={index} style={{ display: "flex", gap: "0.4rem" }}>
            <input
              type="text"
              name="linkLabel"
              value={link.label}
              onChange={(e) => updateLink(index, "label", e.target.value)}
              placeholder="Label"
              maxLength={60}
              className="textInput"
              style={{ flex: 1 }}
            />
            <input
              type="url"
              name="linkUrl"
              value={link.url}
              onChange={(e) => updateLink(index, "url", e.target.value)}
              placeholder="https://…"
              className="textInput"
              style={{ flex: 2 }}
            />
            <button type="button" onClick={() => removeLink(index)} className="button buttonSecondary iconButton" aria-label="Remove link">
              ✕
            </button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" onClick={addLink} className="button buttonSecondary buttonSmall" style={{ alignSelf: "flex-start" }}>
            Add link
          </button>
        )}
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : project ? "Save changes" : "Create project"}
      </button>
    </form>
  );
}
