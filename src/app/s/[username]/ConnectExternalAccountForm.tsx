"use client";

import { useActionState, useRef } from "react";
import { connectExternalAccount } from "@/app/actions/cross-post";
import { CROSS_POST_PLATFORMS } from "@/lib/cross-post-platforms";
import { getSocialPlatformLabel } from "@/lib/theme-presets";

// Same shape as SocialLinksForm.tsx's "add a social link" form — a select
// + one text field + submit, reset on success. connectExternalAccount is a
// stub connect (no live OAuth app exists yet, see social-publish-provider.ts),
// so this collects a display name instead of redirecting through a real
// OAuth authorize step.
export function ConnectExternalAccountForm() {
  const [state, formAction, pending] = useActionState(connectExternalAccount, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="settingsForm"
    >
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select name="platform" className="textInput" defaultValue={CROSS_POST_PLATFORMS[0]} style={{ flex: "1 1 100px" }}>
          {CROSS_POST_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {getSocialPlatformLabel(platform)}
            </option>
          ))}
        </select>
        <input name="displayName" placeholder="Account name or handle" required maxLength={80} className="textInput" style={{ flex: "2 1 160px" }} />
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Connecting…" : "Connect"}
        </button>
      </div>
      <p className="mutedText" style={{ fontSize: "0.8rem" }}>
        Demo connection — no live platform API is wired up yet, so this doesn&apos;t redirect to the real site.
      </p>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
