"use client";

import { useActionState } from "react";
import { createBook, updateBook } from "@/app/actions/books";

type BookFormBook = { id: string; slug: string; title: string; description: string; status: string; visibility: string };

export function BookForm({ book }: { book?: BookFormBook }) {
  const action = book ? updateBook : createBook;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = book?.id ?? "new";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "50ch" }}>
      {book && <input type="hidden" name="bookId" value={book.id} />}
      {!book && (
        <div className="field">
          <label htmlFor={`bookSlug-${idSuffix}`}>Slug (0dot.in/you/books/…)</label>
          <input id={`bookSlug-${idSuffix}`} name="slug" maxLength={80} required pattern="[a-z0-9_]{3,80}" />
        </div>
      )}
      <div className="field">
        <label htmlFor={`bookTitle-${idSuffix}`}>Title</label>
        <input id={`bookTitle-${idSuffix}`} name="title" defaultValue={book?.title} maxLength={200} required />
      </div>
      <div className="field">
        <label htmlFor={`bookDescription-${idSuffix}`}>Description</label>
        <textarea id={`bookDescription-${idSuffix}`} name="description" defaultValue={book?.description} rows={4} maxLength={2000} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`bookCover-${idSuffix}`}>Cover image</label>
          <input id={`bookCover-${idSuffix}`} name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`bookEbook-${idSuffix}`}>Ebook file (PDF/EPUB)</label>
          <input id={`bookEbook-${idSuffix}`} name="ebookFile" type="file" accept="application/pdf,application/epub+zip" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`bookStatus-${idSuffix}`}>Status</label>
          <select id={`bookStatus-${idSuffix}`} name="status" defaultValue={book?.status ?? "draft"} className="textInput">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`bookVisibility-${idSuffix}`}>Visibility</label>
          <select id={`bookVisibility-${idSuffix}`} name="visibility" defaultValue={book?.visibility ?? "public"} className="textInput">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (direct link only)</option>
            <option value="private">Private (only you)</option>
          </select>
        </div>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : book ? "Save changes" : "Create book"}
      </button>
    </form>
  );
}
