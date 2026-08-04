"use client";

import { useActionState } from "react";
import { createPublishedFile, updatePublishedFile } from "@/app/actions/published-files";

type PublishedFileFormFile = { id: string; slug: string; title: string; description: string; visibility: string };

export function PublishedFileForm({ file }: { file?: PublishedFileFormFile }) {
  const action = file ? updatePublishedFile : createPublishedFile;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = file?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "50ch" }}>
      {file && <input type="hidden" name="fileId" value={file.id} />}
      {!file && (
        <div className="field">
          <label htmlFor={`fileSlug-${idSuffix}`}>Slug (0dot.in/you/files/…)</label>
          <input id={`fileSlug-${idSuffix}`} name="slug" maxLength={80} required pattern="[a-z0-9_]{3,80}" />
        </div>
      )}
      <div className="field">
        <label htmlFor={`fileTitle-${idSuffix}`}>Title</label>
        <input id={`fileTitle-${idSuffix}`} name="title" defaultValue={file?.title} maxLength={200} required />
      </div>
      <div className="field">
        <label htmlFor={`fileDescription-${idSuffix}`}>Description</label>
        <textarea id={`fileDescription-${idSuffix}`} name="description" defaultValue={file?.description} rows={4} maxLength={2000} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`fileCover-${idSuffix}`}>Cover image</label>
          <input id={`fileCover-${idSuffix}`} name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`filePdf-${idSuffix}`}>PDF{file ? " (leave blank to keep current)" : ""}</label>
          <input id={`filePdf-${idSuffix}`} name="file" type="file" accept="application/pdf" required={!file} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`fileVisibility-${idSuffix}`}>Visibility</label>
        <select id={`fileVisibility-${idSuffix}`} name="visibility" defaultValue={file?.visibility ?? "public"} className="textInput">
          <option value="public">Public</option>
          <option value="unlisted">Unlisted (direct link only)</option>
          <option value="private">Private (only you)</option>
        </select>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : file ? "Save changes" : "Publish file"}
      </button>
    </form>
  );
}
