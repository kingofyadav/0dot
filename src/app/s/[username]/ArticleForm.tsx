"use client";

import { useActionState, useState } from "react";
import { createArticle, updateArticle } from "@/app/actions/articles";
import { suggestArticleDraft } from "@/app/actions/ai-content";
import { AISuggestButton } from "@/components/AISuggestButton";

type ArticleFormArticle = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  format: string;
  body: string;
  status: string;
  visibility: string;
  tags?: string[];
};

// Mirrors ProjectForm.tsx exactly: branch on the presence of the entity
// prop to pick create vs. update, one shared component for both.
export function ArticleForm({ article }: { article?: ArticleFormArticle }) {
  const action = article ? updateArticle : createArticle;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = article?.id ?? "new";
  const [bodyValue, setBodyValue] = useState(article?.body ?? "");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "50ch" }}>
      {article && <input type="hidden" name="articleId" value={article.id} />}
      {!article && (
        <div className="field">
          <label htmlFor={`articleSlug-${idSuffix}`}>Slug (0dot.in/you/articles/…)</label>
          <input id={`articleSlug-${idSuffix}`} name="slug" maxLength={80} required pattern="[a-z0-9_]{3,80}" />
        </div>
      )}
      <div className="field">
        <label htmlFor={`articleTitle-${idSuffix}`}>Title</label>
        <input id={`articleTitle-${idSuffix}`} name="title" defaultValue={article?.title} maxLength={200} required />
      </div>
      <div className="field">
        <label htmlFor={`articleSubtitle-${idSuffix}`}>Subtitle</label>
        <input id={`articleSubtitle-${idSuffix}`} name="subtitle" defaultValue={article?.subtitle ?? ""} maxLength={300} />
      </div>
      <div className="field">
        <label htmlFor={`articleBody-${idSuffix}`}>Body</label>
        <textarea
          id={`articleBody-${idSuffix}`}
          name="body"
          value={bodyValue}
          onChange={(e) => setBodyValue(e.target.value)}
          rows={10}
        />
      </div>

      <AISuggestButton
        label="AI: Draft this article"
        contextLabel="Topic or working title"
        contextPlaceholder="e.g. Getting started with sourdough"
        generate={suggestArticleDraft}
        onInsert={(text) => setBodyValue((current) => (current.trim().length > 0 ? `${current}\n\n${text}` : text))}
      />
      <div className="field">
        <label htmlFor={`articleTags-${idSuffix}`}>Tags (comma-separated)</label>
        <input id={`articleTags-${idSuffix}`} name="tags" defaultValue={article?.tags?.join(", ")} placeholder="cooking, travel" />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`articleFormat-${idSuffix}`}>Format</label>
          <select id={`articleFormat-${idSuffix}`} name="format" defaultValue={article?.format ?? "article"} className="textInput">
            <option value="article">Article</option>
            <option value="tutorial">Tutorial</option>
            <option value="note">Note</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`articleCover-${idSuffix}`}>Cover image</label>
          <input id={`articleCover-${idSuffix}`} name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </div>
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`articleStatus-${idSuffix}`}>Status</label>
          <select id={`articleStatus-${idSuffix}`} name="status" defaultValue={article?.status ?? "draft"} className="textInput">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`articleVisibility-${idSuffix}`}>Visibility</label>
          <select id={`articleVisibility-${idSuffix}`} name="visibility" defaultValue={article?.visibility ?? "public"} className="textInput">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (direct link only)</option>
            <option value="private">Private (only you)</option>
          </select>
        </div>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : article ? "Save changes" : "Create article"}
      </button>
    </form>
  );
}
