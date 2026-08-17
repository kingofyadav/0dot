import "server-only";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
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

async function writeToUploadsDir(file: File, ext: string): Promise<string> {
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const path = `uploads/${filename}`;

  // access: "public" — these URLs are handed straight to <img>/<a> tags
  // with no auth check on read, so "private" (which needs a signed
  // get()/token round trip) never actually served anything; public also
  // matches Vercel's own guidance against private access for
  // publicly-displayed content (slower delivery, higher egress cost).
  const blob = await put(path, file, {
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

  const url = await writeToUploadsDir(file, ext);
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