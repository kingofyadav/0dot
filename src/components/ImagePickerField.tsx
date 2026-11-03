"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

const THUMB_SIZE = 72;

function thumbStyle(): React.CSSProperties {
  return { position: "relative", width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 };
}

function imgStyle(): React.CSSProperties {
  return { width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--border)" };
}

function removeButtonStyle(): React.CSSProperties {
  return { position: "absolute", top: "-8px", right: "-8px" };
}

// Shared file-picker UX for cover/gallery uploads — a styled trigger (same
// hidden-input-under-a-label-button pattern as ComposeBox's image attach)
// plus live thumbnail previews before the form is even submitted, instead of
// a bare <input type=file> giving no feedback until the page reloads.
//
// "multiple" mode additionally seeds from already-saved URLs (initialUrls)
// as removable thumbnails alongside newly-picked files — editing a gallery
// previously had zero visibility into what was already there, and
// updateProject replaced the whole array the moment any new file was
// submitted. Kept URLs are reported via a hidden input (keepFieldName) the
// server reconciles against the record's real current gallery; new files
// still travel through the same `name` file input the server action already
// reads with formData.getAll(name).
//
// A native <input type=file> only ever holds the FileList from its *last*
// pick — reopening the picker and choosing more files replaces, it doesn't
// append. So instead of relying on the input's own state for multi-file
// accumulation across repeated picks, the real input is kept in sync with
// this component's own `files` state via a reconstructed DataTransfer.files
// list after every add/remove — a normal form submission then sees the full
// accumulated set under one name, no server-side upload path changes needed.
export function ImagePickerField({
  id,
  name,
  label,
  mode = "single",
  initialUrls = [],
  max = 1,
  maxBytes = 5 * 1024 * 1024,
  keepFieldName,
}: {
  id: string;
  name: string;
  label: string;
  mode?: "single" | "multiple";
  initialUrls?: string[];
  max?: number;
  maxBytes?: number;
  keepFieldName?: string;
}) {
  const [keptUrls, setKeptUrls] = useState<string[]>(initialUrls);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  // Keeps the real <input>'s FileList in lockstep with `files` state so a
  // normal (non-JS-intercepted) form submission carries every accumulated
  // file, not just the most recently picked batch.
  useEffect(() => {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
  }, [files]);

  // Single mode never caps out — picking again just replaces the staged
  // file (see addFiles), matching "replace on pick" rather than requiring
  // the user to remove the current pick first.
  const atCap = mode === "multiple" && keptUrls.length + files.length >= max;

  function addFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const picked = Array.from(selected);
    // The <input accept="image/*"> below is only a UI hint — a user can
    // switch the OS file dialog to "All Files" and pick anything, so the
    // actual MIME type needs checking here too, not just the size.
    const nonImage = picked.find((f) => !f.type.startsWith("image/"));
    if (nonImage) {
      setError("Please choose an image file.");
      return;
    }
    const oversize = picked.find((f) => f.size > maxBytes);
    if (oversize) {
      setError(`Images must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller.`);
      return;
    }
    setError(null);
    setFiles((prev) => (mode === "single" ? picked.slice(0, 1) : [...prev, ...picked].slice(0, max - keptUrls.length)));
  }

  function removeNewFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function removeKeptUrl(url: string) {
    setKeptUrls((prev) => prev.filter((u) => u !== url));
  }

  const existingSingleUrl = mode === "single" && files.length === 0 ? initialUrls[0] : undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {mode === "multiple" &&
          keptUrls.map((url) => (
            <div key={url} style={thumbStyle()}>
              {/* eslint-disable-next-line @next/next/no-img-element -- already-uploaded remote asset, not a static local one */}
              <img src={url} alt="" style={imgStyle()} />
              <button
                type="button"
                onClick={() => removeKeptUrl(url)}
                className="button buttonSecondary iconButton"
                style={removeButtonStyle()}
                aria-label="Remove image"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}

        {existingSingleUrl && (
          <div style={thumbStyle()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- already-uploaded remote asset, not a static local one */}
            <img src={existingSingleUrl} alt="Current image" style={imgStyle()} />
          </div>
        )}

        {previews.map((src, index) => (
          <div key={src} style={thumbStyle()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable static asset */}
            <img src={src} alt="" style={imgStyle()} />
            <button
              type="button"
              onClick={() => removeNewFile(index)}
              className="button buttonSecondary iconButton"
              style={removeButtonStyle()}
              aria-label="Remove image"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}

        <label
          className="button buttonSecondary iconButton"
          style={{ cursor: atCap ? "not-allowed" : "pointer", opacity: atCap ? 0.5 : 1 }}
        >
          <ImagePlus size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple={mode === "multiple"}
            disabled={atCap}
            aria-label={label}
            onChange={(e) => addFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {mode === "multiple" &&
        keepFieldName &&
        keptUrls.map((url) => <input key={url} type="hidden" name={keepFieldName} value={url} />)}

      {error && <p className="errorText">{error}</p>}
    </div>
  );
}
