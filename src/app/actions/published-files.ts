"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnProfile, requireVerifiedUser } from "@/lib/auth-guards";
import { saveUploadedImage, saveDocumentFile } from "@/lib/uploads";
import { saveProtectedFile, issueDownloadToken } from "@/lib/protected-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateFileSlugFormat } from "@/lib/reserved-file-slugs";
import type { ActionState } from "@/app/actions/auth";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const VISIBILITY_VALUES = new Set(["public", "unlisted", "private"]);
const ALLOWED_FILE_TYPE = "application/pdf";

function checkFileWriteRateLimit(userId: string): boolean {
  return checkRateLimit(`published_file:write:user:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

type FileFields = { title: string; description: string; visibility: string };

function parseAndValidateFileFields(formData: FormData): { error: string } | FileFields {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1-200 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const visibilityRaw = String(formData.get("visibility") ?? "public");
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : "public";

  return { title, description, visibility };
}

// spec §7.2: storage location depends on visibility, decided once at write
// time — public goes to the plain public/uploads pipeline (stable URL, no
// per-request check ever); private/unlisted goes to protected storage
// (src/lib/protected-storage.ts's existing gated-download mechanism,
// extended with a fourth resourceType rather than a second pipeline).
// Exactly one of {fileUrl} / {fileKey, fileMimeType} is set, matching which
// branch ran — never both.
async function storeFile(file: File, visibility: string, uploadedById: string): Promise<{ fileUrl: string | null; fileKey: string | null; fileMimeType: string } | { error: string }> {
  if (file.type !== ALLOWED_FILE_TYPE) return { error: "Only PDF files are supported." };
  if (file.size > MAX_FILE_BYTES) return { error: `Files must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB or smaller.` };

  if (visibility === "public") {
    const result = await saveDocumentFile(file, { maxBytes: MAX_FILE_BYTES, uploadedById });
    if ("error" in result) return { error: result.error };
    return { fileUrl: result.url, fileKey: null, fileMimeType: file.type };
  }

  const result = await saveProtectedFile(file, { maxBytes: MAX_FILE_BYTES });
  if ("error" in result) return { error: result.error };
  return { fileUrl: null, fileKey: result.key, fileMimeType: file.type };
}

export async function createPublishedFile(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;

  if (!checkFileWriteRateLimit(user.id)) {
    return { error: "You're publishing too fast. Please slow down." };
  }

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const slugError = validateFileSlugFormat(slug);
  if (slugError === "invalid_format") return { error: "Slug must be 3-80 characters: letters, numbers, underscore only." };
  if (slugError === "reserved") return { error: "That slug is reserved." };
  const existingSlug = await db.publishedFile.findUnique({ where: { profileId_slug: { profileId: profile.id, slug } } });
  if (existingSlug) return { error: "You already have a file with that slug." };

  const fields = parseAndValidateFileFields(formData);
  if ("error" in fields) return fields;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "A PDF file is required." };
  const stored = await storeFile(file, fields.visibility, user.id);
  if ("error" in stored) return stored;

  let coverImageUrl: string | undefined;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  const publishedFile = await db.publishedFile.create({
    data: {
      profileId: profile.id,
      slug,
      ...fields,
      coverImageUrl,
      fileUrl: stored.fileUrl,
      fileKey: stored.fileKey,
      fileMimeType: stored.fileMimeType,
      fileSizeBytes: file.size,
      publishedAt: new Date(),
    },
  });

  if (user.username) revalidatePath(`/${user.username.handle}/files`);
  redirect(`/${user.username?.handle}/files/${publishedFile.slug}`);
}

export async function updatePublishedFile(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const fileId = String(formData.get("fileId") ?? "");

  const existing = await db.publishedFile.findUnique({ where: { id: fileId } });
  if (!existing || existing.profileId !== profile.id) return { error: "File not found." };

  const fields = parseAndValidateFileFields(formData);
  if ("error" in fields) return fields;

  let coverImageUrl = existing.coverImageUrl;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  let { fileUrl, fileKey, fileMimeType, fileSizeBytes } = existing;
  const newFile = formData.get("file");
  const storageCategoryChanged = (fields.visibility === "public") !== (existing.visibility === "public");

  if (newFile instanceof File && newFile.size > 0) {
    const stored = await storeFile(newFile, fields.visibility, user.id);
    if ("error" in stored) return stored;
    ({ fileUrl, fileKey, fileMimeType } = stored);
    fileSizeBytes = newFile.size;
  } else if (storageCategoryChanged) {
    // Moving between the public/uploads tier and protected storage means
    // moving the actual bytes — not something this action does implicitly
    // without a fresh upload, since a previously-public file's old stable
    // URL could already be cached/crawled elsewhere and can't be un-exposed
    // retroactively just by changing this row's visibility field.
    return { error: "Re-upload the file when changing visibility between public and private/unlisted." };
  }

  await db.publishedFile.update({
    where: { id: existing.id },
    data: { ...fields, coverImageUrl, fileUrl, fileKey, fileMimeType, fileSizeBytes },
  });

  if (user.username) revalidatePath(`/${user.username.handle}/files`);
  revalidatePath(`/${user.username?.handle}/files/${existing.slug}`);
  return undefined;
}

export async function deletePublishedFile(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const fileId = String(formData.get("fileId") ?? "");
  if (!fileId) return;

  const file = await db.publishedFile.findUnique({ where: { id: fileId } });
  if (!file || file.profileId !== profile.id) return;

  await db.$transaction([
    db.comment.deleteMany({ where: { subjectType: "published_file", subjectId: fileId } }),
    db.reaction.deleteMany({ where: { subjectType: "published_file", subjectId: fileId } }),
    db.publishedFile.delete({ where: { id: fileId } }),
  ]);

  if (user.username) revalidatePath(`/${user.username.handle}/files`);
}

// spec §7.2: the gated path for private/unlisted files — mirrors
// requestLessonFileUrl (courses.ts) exactly, called directly from a client
// component's onClick, not a form.
export async function requestPublishedFileDownloadUrl(fileId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireVerifiedUser();

  const file = await db.publishedFile.findUnique({ where: { id: fileId }, include: { profile: { select: { userId: true } } } });
  if (!file || !file.fileKey) return { error: "This file isn't available for gated download." };
  if (file.visibility === "private" && file.profile.userId !== user.id) return { error: "Not found." };

  const token = issueDownloadToken({ resourceType: "published_file", resourceId: fileId, userId: user.id });
  return { url: `/api/downloads/${token}` };
}
