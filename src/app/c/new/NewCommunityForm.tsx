"use client";

import { useActionState } from "react";
import { createCommunity } from "@/app/actions/communities";

export function NewCommunityForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createCommunity, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" maxLength={80} required />
      </div>

      <div className="field">
        <label htmlFor="slug">Slug</label>
        <input
          id="slug"
          name="slug"
          type="text"
          placeholder="your-community"
          pattern="[a-zA-Z0-9_]{3,40}"
          minLength={3}
          maxLength={40}
          required
        />
        <span className="mutedText">0dot.in/c/your-community — this is permanent.</span>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={500} rows={3} />
      </div>

      <div className="field">
        <label htmlFor="visibility">Visibility</label>
        <select id="visibility" name="visibility" defaultValue="public">
          <option value="public">Public — anyone can view and join instantly</option>
          <option value="restricted">Restricted — anyone can view, joining needs approval</option>
          <option value="private">Private — content is members-only, joining needs approval</option>
        </select>
      </div>

      {organizations.length > 0 && (
        <div className="field">
          <label htmlFor="organizationId">Restrict to organization (optional)</label>
          <select id="organizationId" name="organizationId" defaultValue="">
            <option value="">Not restricted</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <span className="mutedText">
            Only active members of that organization can join or view this community, regardless of the
            visibility chosen above.
          </span>
        </div>
      )}

      <div className="field">
        <label htmlFor="avatar">Avatar</label>
        <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Create community"}
      </button>
    </form>
  );
}
