"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { suggestProfileBio } from "@/app/actions/ai-content";
import { AISuggestButton } from "@/components/AISuggestButton";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { useBrowserTab } from "@/components/BrowserTabProvider";

export function EditProfileForm({
  displayName,
  bio,
  avatarUrl,
  coverUrl,
  themePreset,
  isPrivate,
}: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  themePreset: string;
  isPrivate: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, undefined);
  const [bioValue, setBioValue] = useState(bio);
  const { setUnsaved, flash, resolveStaleSaving } = useBrowserTab();
  const wasPending = useRef(false);

  // Success redirects back to this same URL (see updateProfile), which
  // makes Next.js remount this whole form with the freshly saved data —
  // so on mount, claim any "saving" flash left behind by the instance
  // that's about to be replaced, rather than waiting for its own
  // pending->false transition that will never get a chance to run here.
  useEffect(() => {
    resolveStaleSaving("Profile saved");
  }, [resolveStaleSaving]);

  useEffect(() => {
    if (pending) {
      flash("saving", "Saving profile");
    } else if (wasPending.current) {
      if (state?.error) flash("error", state.error);
      else flash("success", "Profile saved");
    }
    wasPending.current = pending;
  }, [pending, state, flash]);

  useEffect(() => () => setUnsaved(false), [setUnsaved]);

  return (
    <form
      action={formAction}
      onChange={() => setUnsaved(true)}
      className="authCard"
      style={{ maxWidth: "none" }}
    >
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

      <div className="field">
        <label htmlFor="isPrivate" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input id="isPrivate" name="isPrivate" type="checkbox" defaultChecked={isPrivate} style={{ width: "auto" }} />
          Private profile
        </label>
        <p className="mutedText" style={{ fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
          When private, only your name, avatar, and bio are visible to
          people who don&apos;t follow you — your posts, links, and
          portfolio stay hidden until they follow you.
        </p>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
