import * as DocumentPicker from "expo-document-picker";
import type { MessageAttachmentUpload } from "../api/client";

// Mobile pro-upgrade addendum, sub-phase M13. Mirrors ALLOWED_MESSAGE_FILE_TYPES
// server-side (lib/uploads.ts) — images, PDF, or plain text — filtered here
// too so a doomed-to-be-rejected pick never reaches the upload step at all.
const ALLOWED_FILE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];

export async function pickAttachmentFile(): Promise<MessageAttachmentUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ALLOWED_FILE_MIME_TYPES, copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream", kind: "file" };
}
