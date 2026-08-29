"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { createScheduledCrossPost } from "@/app/actions/cross-post";
import { SocialIcon } from "@/components/SocialIcon";
import { getSocialPlatformLabel } from "@/lib/theme-presets";
import type { CrossPostPlatform } from "@/lib/cross-post-platforms";

const MAX_MEDIA = 4;

// Mirrors feed/ComposeBox.tsx's file-attach + local-preview shape, with a
// platform checkbox list and a scheduledFor datetime-local input
// (LivestreamForm.tsx's precedent for a single one-time timestamp) added
// on top.
export function ComposeCrossPostForm({
  accounts,
}: {
  accounts: { id: string; platform: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(createScheduledCrossPost, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected)].slice(0, MAX_MEDIA));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  if (accounts.length === 0) {
    return <p className="mutedText">Connect an account above before scheduling a post.</p>;
  }

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        files.forEach((file) => formData.append("media", file));
        await formAction(formData);
        formRef.current?.reset();
        setFiles([]);
      }}
      className="settingsForm"
    >
      <textarea name="content" placeholder="What's happening?" maxLength={500} rows={3} className="textInput" />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {accounts.map((account) => (
          <label key={account.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="accountIds" value={account.id} />
            <SocialIcon platform={account.platform as CrossPostPlatform} />
            {getSocialPlatformLabel(account.platform)} — {account.displayName}
          </label>
        ))}
      </div>

      <div className="field">
        <label htmlFor="crossPostScheduledFor">Scheduled for</label>
        <input id="crossPostScheduledFor" name="scheduledFor" type="datetime-local" required className="textInput" />
      </div>

      {previews.length > 0 && (
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          {previews.map((src, index) => (
            <div key={src} style={{ position: "relative", width: "72px", height: "72px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable static asset */}
              <img
                src={src}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--border)" }}
              />
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="button buttonSecondary iconButton"
                style={{ position: "absolute", top: "-8px", right: "-8px" }}
                aria-label="Remove image"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {state?.error && <p className="errorText">{state.error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label
          className="button buttonSecondary iconButton"
          style={{ cursor: files.length >= MAX_MEDIA ? "not-allowed" : "pointer", opacity: files.length >= MAX_MEDIA ? 0.5 : 1 }}
          aria-label="Attach images"
        >
          <Camera size={16} aria-hidden="true" />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            disabled={files.length >= MAX_MEDIA}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule post"}
        </button>
      </div>
    </form>
  );
}
