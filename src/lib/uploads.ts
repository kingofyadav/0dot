import "server-only";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import { fileTypeFromBuffer } from "file-type";
import { createFileAsset, type FileAssetContentType } from "@/lib/ai-accessibility";

const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_VOICE_NOTE_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

const ALLOWED_MESSAGE_FILE_TYPES: Record<string, string> = {
  ...ALLOWED_IMAGE_EXTENSIONS,
  "application/pdf": "pdf",
  "text/plain": "txt",
};

const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
};

export type UploadResult = { url: string } | { error: string };

const TYPE_MISMATCH_ERROR = "File content doesn't match its declared type.";

// Markers that would make a browser render (not just display as text) a
// file it fetches — checked against the first KB of anything declared
// text/plain, since that's the one allow-listed type file-type can't sniff
// (plain text has no magic bytes). Case-insensitive, matches with or
// without a leading "<".
const MARKUP_SNIFF_PATTERN = /<(!doctype|html|head|body|script|iframe|svg|object|embed|meta)\b/i;

// file.type is whatever the browser/client claims on the multipart part —
// trivially spoofable by anything that isn't the real web UI. This
// verifies the bytes actually are what's declared before the file is
// written to public, directly-linked blob storage. file-type only
// recognizes binary formats and, for a few of them, reports a mime string
// that differs from the one this app allow-lists (documented per-case
// below) — so this is a mapping, not a strict equality check.
async function bytesMatchDeclaredType(buffer: Buffer, declaredType: string): Promise<boolean> {
  if (declaredType === "text/plain") {
    // Any recognized binary signature here means the bytes aren't actually
    // plain text, whatever Content-Type the client sent.
    const detected = await fileTypeFromBuffer(buffer);
    if (detected) return false;
    return !MARKUP_SNIFF_PATTERN.test(buffer.subarray(0, 1024).toString("utf8"));
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) return false;

  switch (declaredType) {
    case "image/png":
    case "image/jpeg":
    case "image/webp":
    case "image/gif":
    case "application/pdf":
    case "application/epub+zip":
      return detected.mime === declaredType;
    case "audio/webm":
      // MediaRecorder-produced audio-only WebM is an EBML/Matroska
      // container file-type can't distinguish from video/webm by magic
      // bytes alone — the container signature itself is the real check.
      return detected.ext === "webm";
    case "audio/mp4":
      // Real .m4a audio is reported as audio/x-m4a (ISO-BMFF brand
      // sniffing), not audio/mp4 — both are legitimate here.
      return detected.mime === "audio/mp4" || detected.mime === "audio/x-m4a";
    case "audio/mpeg":
      return detected.mime === "audio/mpeg";
    case "audio/ogg":
      // Covers plain Ogg/Vorbis ("audio/ogg") and Opus-in-Ogg
      // ("audio/ogg; codecs=opus") — what browsers actually record.
      return detected.mime.startsWith("audio/ogg");
    default:
      return false;
  }
}

async function writeToUploadsDir(buffer: Buffer, ext: string): Promise<string> {
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const path = `uploads/${filename}`;

  // access: "public" — these URLs are handed straight to <img>/<a> tags
  // with no auth check on read, so "private" (which needs a signed
  // get()/token round trip) never actually served anything; public also
  // matches Vercel's own guidance against private access for
  // publicly-displayed content (slower delivery, higher egress cost).
  const blob = await put(path, buffer, {
    access: "public",
    addRandomSuffix: false,
  });

  return blob.url;
}

export async function saveUploadedImage(
  file: File,
  { maxBytes = 5 * 1024 * 1024, uploadedById }: { maxBytes?: number; uploadedById?: string } = {}
): Promise<UploadResult> {
  const ext = ALLOWED_IMAGE_EXTENSIONS[file.type];
  if (!ext) {
    return { error: "Images must be PNG, JPEG, WEBP, or GIF." };
  }
  if (file.size > maxBytes) {
    return { error: `Images must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await bytesMatchDeclaredType(buffer, file.type))) {
    return { error: TYPE_MISMATCH_ERROR };
  }

  const url = await writeToUploadsDir(buffer, ext);
  if (uploadedById) await createFileAsset({ url, contentType: "image", uploadedById });
  return { url };
}

export async function saveDocumentFile(
  file: File,
  { maxBytes = 20 * 1024 * 1024, uploadedById }: { maxBytes?: number; uploadedById?: string } = {}
): Promise<UploadResult> {
  const ext = ALLOWED_DOCUMENT_TYPES[file.type];
  if (!ext) return { error: "Only PDF or EPUB files are supported." };
  if (file.size > maxBytes) {
    return { error: `Files must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await bytesMatchDeclaredType(buffer, file.type))) {
    return { error: TYPE_MISMATCH_ERROR };
  }

  const url = await writeToUploadsDir(buffer, ext);
  if (uploadedById) await createFileAsset({ url, contentType: "document", uploadedById });
  return { url };
}

export type MessageAttachmentKind = "voice_note" | "file";

export type MessageAttachmentResult =
  | { url: string; mimeType: string; sizeBytes: number; fileName: string | null }
  | { error: string };

const MESSAGE_ATTACHMENT_LIMITS: Record<
  MessageAttachmentKind,
  { types: Record<string, string>; maxBytes: number; typeErrorLabel: string }
> = {
  voice_note: {
    types: ALLOWED_VOICE_NOTE_TYPES,
    maxBytes: 10 * 1024 * 1024,
    typeErrorLabel: "Voice notes must be WEBM, M4A, MP3, or OGG audio.",
  },
  file: {
    types: ALLOWED_MESSAGE_FILE_TYPES,
    maxBytes: 20 * 1024 * 1024,
    typeErrorLabel: "Files must be an image, PDF, or plain text file.",
  },
};

export async function saveMessageAttachment(
  file: File,
  kind: MessageAttachmentKind,
  uploadedById?: string
): Promise<MessageAttachmentResult> {
  const { types, maxBytes, typeErrorLabel } = MESSAGE_ATTACHMENT_LIMITS[kind];
  const ext = types[file.type];
  if (!ext) return { error: typeErrorLabel };
  if (file.size > maxBytes) {
    return { error: `${kind === "voice_note" ? "Voice notes" : "Files"} must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await bytesMatchDeclaredType(buffer, file.type))) {
    return { error: TYPE_MISMATCH_ERROR };
  }

  const url = await writeToUploadsDir(buffer, ext);
  if (uploadedById) {
    const contentType: FileAssetContentType =
      kind === "voice_note" ? "audio" : file.type.startsWith("image/") ? "image" : "document";
    await createFileAsset({ url, contentType, uploadedById });
  }
  // Previously dropped entirely — MessageBubble.tsx had nothing but the
  // MIME type left to display for a file attachment. Voice notes get no
  // name here (the recorded Blob's own .name, typically "blob", isn't a
  // real filename worth showing next to the player UI that already renders
  // for them); a plain file's original name is worth keeping.
  const fileName = kind === "file" && file.name ? file.name : null;
  return { url, mimeType: file.type, sizeBytes: file.size, fileName };
}

// ── Post media: client-direct Blob upload ────────────────────────────────
// ComposeBox uploads post images straight to Vercel Blob via
// /api/upload/post-media, so createPost (src/app/actions/posts.ts) only
// ever receives URLs — no 30MB+ multipart body buffered in a Function. The
// client-upload token only enforces the *declared* Content-Type, so these
// helpers re-add server-side the magic-byte check that saveUploadedImage
// does inline — but reading ~4KB of the finished object rather than the
// whole file.

export const BLOB_PUBLIC_HOST_SUFFIX = ".public.blob.vercel-storage.com";

// Derives this app's Blob store's public hostname from BLOB_READ_WRITE_TOKEN
// (format vercel_blob_rw_<storeId>_<random>) rather than hardcoding it —
// dev/preview/production each have their own store, so a literal hostname
// only ever matched one of them (src/app/uploads/[...path]/route.ts used to
// hardcode one directly). Resolved lazily, not at module load, so a `next
// build`'s route-data collection — which evaluates every route module,
// that one included — never depends on this secret being present; same
// posture as protected-storage.ts's DOWNLOAD_TOKEN_SECRET.
export function getBlobPublicHost(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  const storeId = token.split("_")[3];
  if (!storeId) throw new Error("BLOB_READ_WRITE_TOKEN is not in the expected vercel_blob_rw_<storeId>_... format.");
  return `${storeId}${BLOB_PUBLIC_HOST_SUFFIX}`;
}

export const POST_MEDIA_IMAGE_TYPES = Object.keys(ALLOWED_IMAGE_EXTENSIONS);
export const POST_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

// A mediaUrls entry is acceptable only if it points at this app's own Blob
// store under the uploads/ prefix — never an arbitrary attacker-chosen URL
// smuggled into the field.
export function isOwnBlobUploadUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(BLOB_PUBLIC_HOST_SUFFIX) &&
      u.pathname.startsWith("/uploads/")
    );
  } catch {
    return false;
  }
}

// Fetches the first 4KB of a freshly client-uploaded blob and confirms the
// bytes really are one of the allowed image formats (defeats a spoofed
// Content-Type on the client-upload token). Returns the canonical
// extension, or null if the URL isn't ours or the bytes don't match.
export async function verifyRemoteImageBytes(rawUrl: string): Promise<string | null> {
  if (!isOwnBlobUploadUrl(rawUrl)) return null;
  try {
    const res = await fetch(rawUrl, { headers: { Range: "bytes=0-4095" } });
    if (!res.ok && res.status !== 206) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected) return null;
    return ALLOWED_IMAGE_EXTENSIONS[detected.mime] ?? null;
  } catch {
    return null;
  }
}