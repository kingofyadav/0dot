import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type UploadResult = { url: string } | { error: string };

// Shared by profile avatar/cover uploads and post media uploads — writes
// straight to public/uploads (no cloud storage wired up yet, see
// src/app/actions/profile.ts's original note on this). Allowlists file
// types rather than blocklisting, same reasoning as isSafeUrl elsewhere.
export async function saveUploadedImage(
  file: File,
  { maxBytes = 5 * 1024 * 1024 }: { maxBytes?: number } = {}
): Promise<UploadResult> {
  const ext = ALLOWED_IMAGE_EXTENSIONS[file.type];
  if (!ext) {
    return { error: "Images must be PNG, JPEG, WEBP, or GIF." };
  }
  if (file.size > maxBytes) {
    return { error: `Images must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, filename), buffer);

  return { url: `/uploads/${filename}` };
}
