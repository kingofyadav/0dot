"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPost } from "@/app/actions/posts";

const MAX_MEDIA = 4;

export function ComposeBox() {
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
      <textarea
        name="body"
        placeholder="What's happening?"
        maxLength={500}
        rows={3}
        className="textInput"
      />

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
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
