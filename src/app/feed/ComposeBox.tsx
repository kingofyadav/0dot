"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPost } from "@/app/actions/posts";

const MAX_MEDIA = 4;

export function ComposeBox({
  communityId,
  flairs,
  postableBusinesses,
  ownTiers,
}: {
  communityId?: string;
  // phase-3 spec §6: only ever passed alongside communityId — /feed and
  // /explore's plain compose box never has a flair set to offer.
  flairs?: { id: string; label: string }[];
  // phase-4 spec §5: businesses this user can post as (owner|admin|editor
  // tier), offered as a "Post as" picker. Only ever passed on the global
  // /feed and /explore compose boxes — a business isn't a CommunityMember,
  // so there's no "post as this business into this community" case to wire.
  postableBusinesses?: { id: string; name: string }[];
  // phase-5 spec §4.2: this author's own active MembershipTiers, offered
  // as a "gate this post" picker — createPost re-validates ownership
  // server-side regardless (see posts.ts), this is just what's offered.
  ownTiers?: { id: string; name: string }[];
} = {}) {
  const [state, formAction, pending] = useActionState(createPost, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  // Derived during render, not via setState-in-effect (react-hooks/set-state-in-effect)
  // — the effect below only handles revoking the previous URLs, not computing state.
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

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        files.forEach((file) => formData.append("media", file));
        await formAction(formData);
        formRef.current?.reset();
        setFiles([]);
      }}
      className="authCard"
      style={{ maxWidth: "none", marginBottom: "1.5rem" }}
    >
      {communityId && <input type="hidden" name="communityId" value={communityId} />}
      {!communityId && postableBusinesses && postableBusinesses.length > 0 && (
        <select name="businessId" defaultValue="" className="textInput" style={{ marginBottom: "0.5rem" }}>
          <option value="">Post as myself</option>
          {postableBusinesses.map((b) => (
            <option key={b.id} value={b.id}>
              Post as {b.name}
            </option>
          ))}
        </select>
      )}
      {communityId && flairs && flairs.length > 0 && (
        <select name="flairId" defaultValue="" className="textInput" style={{ marginBottom: "0.5rem" }}>
          <option value="">No flair</option>
          {flairs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      <textarea
        name="body"
        placeholder="What's happening?"
        maxLength={500}
        rows={3}
        className="textInput"
      />

      {ownTiers && ownTiers.length > 0 && (
        <select name="requiredTierId" defaultValue="" className="textInput" style={{ marginTop: "0.5rem" }}>
          <option value="">Visible to everyone</option>
          {ownTiers.map((t) => (
            <option key={t.id} value={t.id}>
              🔒 {t.name} subscribers only
            </option>
          ))}
        </select>
      )}

      {previews.length > 0 && (
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          {previews.map((src, index) => (
            <div key={src} style={{ position: "relative", width: "72px", height: "72px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable static asset */}
              <img
                src={src}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="button buttonSecondary iconButton"
                style={{ position: "absolute", top: "-8px", right: "-8px" }}
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {state?.error && <p className="errorText">{state.error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <label
            className="button buttonSecondary iconButton"
            style={{
              cursor: files.length >= MAX_MEDIA ? "not-allowed" : "pointer",
              opacity: files.length >= MAX_MEDIA ? 0.5 : 1,
            }}
            aria-label="Attach images"
          >
            📷
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
          <label className="mutedText" style={{ fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <input type="checkbox" name="postType" value="question" />❓ Question
          </label>
        </span>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
