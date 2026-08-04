"use client";

import { useActionState } from "react";
import { createBookChapter, updateBookChapter } from "@/app/actions/knowledge-pages";

type BookChapterFormChapter = {
  id: string;
  slug: string;
  title: string;
  body: string;
  visibility: string;
  parentPageId: string | null;
  position: number;
};

// Mirrors WikiPageForm.tsx (the profile-owned equivalent) exactly, scoped
// to a book via a hidden bookId field instead of implicit profile
// ownership — same underlying WikiPage table and revision mechanics,
// spec §6.1.
export function BookChapterForm({
  bookId,
  chapter,
  otherChapters,
}: {
  bookId: string;
  chapter?: BookChapterFormChapter;
  otherChapters: { id: string; title: string }[];
}) {
  const action = chapter ? updateBookChapter : createBookChapter;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = chapter?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "50ch" }}>
      <input type="hidden" name="bookId" value={bookId} />
      {chapter && <input type="hidden" name="pageId" value={chapter.id} />}
      {!chapter && (
        <div className="field">
          <label htmlFor={`chapterSlug-${idSuffix}`}>Slug</label>
          <input id={`chapterSlug-${idSuffix}`} name="slug" maxLength={60} required pattern="[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?" />
        </div>
      )}
      <div className="field">
        <label htmlFor={`chapterTitle-${idSuffix}`}>Title</label>
        <input id={`chapterTitle-${idSuffix}`} name="title" defaultValue={chapter?.title} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`chapterBody-${idSuffix}`}>Content</label>
        <textarea id={`chapterBody-${idSuffix}`} name="body" defaultValue={chapter?.body} rows={10} required />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`chapterVisibility-${idSuffix}`}>Visibility</label>
          <select id={`chapterVisibility-${idSuffix}`} name="visibility" defaultValue={chapter?.visibility ?? "public"} className="textInput">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (direct link only)</option>
            <option value="private">Private (only you)</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`chapterParent-${idSuffix}`}>Parent chapter</label>
          <select id={`chapterParent-${idSuffix}`} name="parentPageId" defaultValue={chapter?.parentPageId ?? ""} className="textInput">
            <option value="">None (top-level)</option>
            {otherChapters.filter((c) => c.id !== chapter?.id).map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`chapterPosition-${idSuffix}`}>Position</label>
          <input id={`chapterPosition-${idSuffix}`} name="position" type="number" defaultValue={chapter?.position ?? 0} className="textInput" />
        </div>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : chapter ? "Save changes" : "Add chapter"}
      </button>
    </form>
  );
}
