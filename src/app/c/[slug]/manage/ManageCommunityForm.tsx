"use client";

import { useActionState } from "react";
import { updateCommunity } from "@/app/actions/communities";

export function ManageCommunityForm({
  communityId,
  name,
  description,
  visibility,
  avatarUrl,
  coverUrl,
  wikiEditPolicy,
}: {
  communityId: string;
  name: string;
  description: string;
  visibility: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  wikiEditPolicy: string;
}) {
  const [state, formAction, pending] = useActionState(updateCommunity, undefined);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="communityId" value={communityId} />

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" defaultValue={name} maxLength={80} required />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={description} maxLength={500} rows={3} />
      </div>

      <div className="field">
        <label htmlFor="visibility">Visibility</label>
        <select id="visibility" name="visibility" defaultValue={visibility}>
          <option value="public">Public — anyone can view and join instantly</option>
          <option value="restricted">Restricted — anyone can view, joining needs approval</option>
          <option value="private">Private — content is members-only, joining needs approval</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="wikiEditPolicy">Who can edit the wiki</label>
        <select id="wikiEditPolicy" name="wikiEditPolicy" defaultValue={wikiEditPolicy}>
          <option value="moderators">Moderators only</option>
          <option value="members">Any member</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="avatar">Avatar</label>
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-uploaded file, not an optimizable static asset
          <img src={avatarUrl} alt="Current avatar" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover", marginBottom: "0.4rem" }} />
        )}
        <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-uploaded file, not an optimizable static asset
          <img src={coverUrl} alt="Current cover" style={{ width: "100%", maxHeight: "80px", objectFit: "cover", borderRadius: "8px", marginBottom: "0.4rem" }} />
        )}
        <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
