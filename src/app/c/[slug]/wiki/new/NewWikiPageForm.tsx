"use client";

import { useActionState } from "react";
import { createWikiPage } from "@/app/actions/wiki";

export function NewWikiPageForm({ communityId }: { communityId: string }) {
  const [state, formAction, pending] = useActionState(createWikiPage, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "48ch" }}>
      <input type="hidden" name="communityId" value={communityId} />
      <label>
        Title
        <input type="text" name="title" maxLength={120} required className="textInput" />
      </label>
      <label>
        Slug (in the URL)
        <input type="text" name="slug" placeholder="style-guide" required className="textInput" />
      </label>
      <label>
        Content
        <textarea name="body" rows={12} required className="textInput" placeholder="# Heading&#10;&#10;Body text with **bold**, *italic*, `code`, [links](https://example.com), and&#10;- bullet lists" />
      </label>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create page"}
      </button>
    </form>
  );
}
