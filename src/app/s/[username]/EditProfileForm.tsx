"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { suggestProfileBio } from "@/app/actions/ai-content";
import { AISuggestButton } from "@/components/AISuggestButton";
import { THEME_PRESETS } from "@/lib/theme-presets";

export function EditProfileForm({
  displayName,
  bio,
  avatarUrl,
  coverUrl,
  themePreset,
}: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  themePreset: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, undefined);
  const [bioValue, setBioValue] = useState(bio);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          defaultValue={displayName}
          maxLength={50}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          name="bio"
          value={bioValue}
          onChange={(e) => setBioValue(e.target.value)}
          maxLength={280}
          rows={3}
        />
      </div>

      <AISuggestButton
        label="AI: Suggest a bio"
        contextLabel="What should your bio focus on? (optional)"
        contextPlaceholder="e.g. indie game dev, plant care"
        generate={suggestProfileBio}
        onInsert={setBioValue}
      />

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

      <div className="field">
        <label htmlFor="themePreset">Theme</label>
        <select id="themePreset" name="themePreset" defaultValue={themePreset}>
          {THEME_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
