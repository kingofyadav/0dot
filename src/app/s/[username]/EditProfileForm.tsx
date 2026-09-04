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
  isPremium,
}: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  themePreset: string;
  isPrivate: boolean;
  isPremium: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, undefined);
  const [bioValue, setBioValue] = useState(bio);
  // Mirrors saveUploadedImage's default maxBytes (src/lib/uploads.ts) — kept
  // in sync manually since that module is server-only. Catching an oversize
  // file on selection means the error shows immediately next to the input
  // instead of only after a full upload round-trip ends in the same
  // rejection.
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const { setUnsaved, flash, resolveStaleSaving } = useBrowserTab();
  const wasPending = useRef(false);

  function checkFileSize(e: React.ChangeEvent<HTMLInputElement>, setError: (msg: string | null) => void) {
    const file = e.target.files?.[0];
    setError(file && file.size > 5 * 1024 * 1024 ? "Images must be 5MB or smaller." : null);
  }

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
      // Belt-and-suspenders: Next.js intercepts this submit via JS and builds
      // FormData directly from the DOM form regardless of encType, so this
      // has no effect in the normal case. It matters only if hydration
      // hasn't finished (or breaks) and the browser falls back to a native
      // submit — without it, that fallback silently defaults to
      // application/x-www-form-urlencoded, which drops the file fields
      // while text fields still "save," with no error shown at all.
      encType="multipart/form-data"
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
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => checkFileSize(e, setAvatarError)}
        />
        {avatarError && <p className="errorText">{avatarError}</p>}
      </div>

      <div className="field">
        <label htmlFor="cover">Cover image</label>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-uploaded file, not an optimizable static asset
          <img src={coverUrl} alt="Current cover" style={{ width: "100%", maxHeight: "80px", objectFit: "cover", borderRadius: "8px", marginBottom: "0.4rem" }} />
        )}
        <input
          id="cover"
          name="cover"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => checkFileSize(e, setCoverError)}
        />
        {coverError && <p className="errorText">{coverError}</p>}
      </div>

      <div className="field">
        <label htmlFor="themePreset">Theme</label>
        <select id="themePreset" name="themePreset" defaultValue={themePreset}>
          {THEME_PRESETS.map((preset) => (
            <option
              key={preset.key}
              value={preset.key}
              disabled={preset.premiumOnly && !isPremium && preset.key !== themePreset}
            >
              {preset.label}
              {preset.premiumOnly ? " (Premium)" : ""}
            </option>
          ))}
        </select>
        {!isPremium && (
          <p className="mutedText" style={{ fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
            Premium unlocks {THEME_PRESETS.filter((p) => p.premiumOnly).length} additional theme presets.
          </p>
        )}
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

      <button type="submit" className="button" disabled={pending || Boolean(avatarError || coverError)}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
