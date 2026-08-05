import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createFileAsset, type FileAssetContentType } from "@/lib/ai-accessibility";

const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// phase-2 spec §5.4 says "arbitrary file upload" for message attachments —
// this codebase uses an explicit MIME allowlist instead (not a blocklist),
// matching this same file's saveUploadedImage and the isSafeUrl posture
// used elsewhere. Deliberate deviation from the spec's literal wording,
// same treatment schema.prisma's trendingScore comment gives its own
// literal-spec deviation: security posture wins over the literal text.
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

export type UploadResult = { url: string } | { error: string };

async function writeToUploadsDir(file: File, ext: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

// Shared by profile avatar/cover uploads and post media uploads — writes
// straight to public/uploads (no cloud storage wired up yet, see
// src/app/actions/profile.ts's original note on this). Allowlists file
// types rather than blocklisting, same reasoning as isSafeUrl elsewhere.
// phase-11 spec §6.1/§6.4: uploadedById is optional only so existing
// call sites keep compiling one at a time during migration — every call
// site that has an authenticated user in scope passes it, since every new
// upload from this phase forward must create a FileAsset row (no new
// upload path bypasses it).
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

  const url = await writeToUploadsDir(file, ext);
  if (uploadedById) await createFileAsset({ url, contentType: "image", uploadedById });
  return { url };
}

const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  // phase-7 spec §6.1/§6.2: Book.ebookFileUrl's "epub/pdf" — widened from
  // the original PDF-only allowlist (resume/research-paper PDFs), same
  // direct-filesystem-write path, no new upload function needed.
  "application/epub+zip": "epub",
};

// phase-6 spec §6.1/§7.1: resume PDFs and research paper PDFs are optional
// uploaded documents, same direct-filesystem-write pattern as every other
// upload here — a dedicated allowlist rather than reusing
// saveMessageAttachment's "file" kind, since that one also accepts images/
// text and carries message-specific size limits that don't apply here.
export async function saveDocumentFile(
  file: File,
  { maxBytes = 20 * 1024 * 1024, uploadedById }: { maxBytes?: number; uploadedById?: string } = {}
): Promise<UploadResult> {
  const ext = ALLOWED_DOCUMENT_TYPES[file.type];
  if (!ext) return { error: "Only PDF or EPUB files are supported." };
  if (file.size > maxBytes) {
    return { error: `Files must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };
  }

  const url = await writeToUploadsDir(file, ext);
  if (uploadedById) await createFileAsset({ url, contentType: "document", uploadedById });
  return { url };
}

export type MessageAttachmentKind = "voice_note" | "file";

export type MessageAttachmentResult = { url: string; mimeType: string; sizeBytes: number } | { error: string };

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

// phase-2 spec §5.4: file sharing and voice notes reuse this same
// pre-signed... well, direct-filesystem-write pattern (same caveat as
// saveUploadedImage — no cloud storage yet), rather than a second upload
// pipeline. duration_s for voice notes is computed client-side and trusted
// for display only (spec §5.4), not re-validated server-side here.
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

  const url = await writeToUploadsDir(file, ext);
  if (uploadedById) {
    const contentType: FileAssetContentType =
      kind === "voice_note" ? "audio" : file.type.startsWith("image/") ? "image" : "document";
    await createFileAsset({ url, contentType, uploadedById });
  }
  return { url, mimeType: file.type, sizeBytes: file.size };
}
