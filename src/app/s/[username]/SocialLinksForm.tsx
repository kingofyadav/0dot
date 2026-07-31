"use client";

import { useActionState, useRef } from "react";
import { addSocialLink } from "@/app/actions/profile";
import { SOCIAL_PLATFORMS, getSocialPlatformLabel } from "@/lib/theme-presets";

export function SocialLinksForm() {
  const [state, formAction, pending] = useActionState(addSocialLink, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
    >
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Add a social link</h2>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select
          name="platform"
          className="textInput"
          defaultValue={SOCIAL_PLATFORMS[0]}
          style={{ flex: "1 1 100px" }}
        >
          {SOCIAL_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {getSocialPlatformLabel(platform)}
            </option>
          ))}
        </select>
        <input
          name="url"
          type="url"
          placeholder="https://…"
          required
          className="textInput"
          style={{ flex: "2 1 160px" }}
        />
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
