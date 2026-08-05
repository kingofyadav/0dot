"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { saveUploadedImage, saveDocumentFile } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateBookSlugFormat } from "@/lib/reserved-book-slugs";
import type { ActionState } from "@/app/actions/auth";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const STATUS_VALUES = new Set(["draft", "published"]);
const VISIBILITY_VALUES = new Set(["public", "unlisted", "private"]);

function checkBookWriteRateLimit(userId: string): boolean {
  return checkRateLimit(`book:write:user:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

type BookFields = { title: string; description: string; status: string; visibility: string };

function parseAndValidateBookFields(formData: FormData): { error: string } | BookFields {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1-200 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "draft";

  const visibilityRaw = String(formData.get("visibility") ?? "public");
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : "public";

  return { title, description, status, visibility };
}

// spec §6.2: two authoring paths, neither mandatory — a Book with only
// ebookFileUrl set and zero chapters is a valid, publishable state (§6.3's
// literal acceptance criterion), so createBook never requires a chapter.
export async function createBook(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;

  if (!checkBookWriteRateLimit(user.id)) {
    return { error: "You're publishing too fast. Please slow down." };
  }

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const slugError = validateBookSlugFormat(slug);
  if (slugError === "invalid_format") return { error: "Slug must be 3-80 characters: letters, numbers, underscore only." };
  if (slugError === "reserved") return { error: "That slug is reserved." };
  const existingSlug = await db.book.findUnique({ where: { profileId_slug: { profileId: profile.id, slug } } });
  if (existingSlug) return { error: "You already have a book with that slug." };

  const fields = parseAndValidateBookFields(formData);
  if ("error" in fields) return fields;

  let coverImageUrl: string | undefined;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  let ebookFileUrl: string | undefined;
  const ebookFile = formData.get("ebookFile");
  if (ebookFile instanceof File && ebookFile.size > 0) {
    const result = await saveDocumentFile(ebookFile, { uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    ebookFileUrl = result.url;
  }

  const book = await db.book.create({
    data: { profileId: profile.id, slug, ...fields, coverImageUrl, ebookFileUrl },
  });

  if (user.username) revalidatePath(`/${user.username.handle}/books`);
  redirect(`/${user.username?.handle}/books/${book.slug}`);
}

export async function updateBook(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const bookId = String(formData.get("bookId") ?? "");

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book || book.profileId !== profile.id) return { error: "Book not found." };

  const fields = parseAndValidateBookFields(formData);
  if ("error" in fields) return fields;

  let coverImageUrl = book.coverImageUrl;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  let ebookFileUrl = book.ebookFileUrl;
  const ebookFile = formData.get("ebookFile");
  if (ebookFile instanceof File && ebookFile.size > 0) {
    const result = await saveDocumentFile(ebookFile, { uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    ebookFileUrl = result.url;
  }

  await db.book.update({ where: { id: book.id }, data: { ...fields, coverImageUrl, ebookFileUrl } });

  if (user.username) revalidatePath(`/${user.username.handle}/books`);
  revalidatePath(`/${user.username?.handle}/books/${book.slug}`);
  return undefined;
}

// Hard-deleted, same posture as deleteArticle — cleans up the non-FK'd
// Reaction/Comment rows and every chapter (WikiPage rows with bookId set;
// deleting the Book cascades them via bookId's onDelete: Cascade, but their
// own Reaction/Comment rows are equally non-FK'd and need the same explicit
// cleanup deleteProfileWikiPage/deleteBookChapter already give a single
// chapter — done here in bulk since the whole book is going away at once).
export async function deleteBook(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const bookId = String(formData.get("bookId") ?? "");
  if (!bookId) return;

  const book = await db.book.findUnique({ where: { id: bookId }, include: { chapters: { select: { id: true } } } });
  if (!book || book.profileId !== profile.id) return;

  const chapterIds = book.chapters.map((c) => c.id);
  const subjectFilter = {
    OR: [
      { subjectType: "book", subjectId: bookId },
      { subjectType: "wiki_page", subjectId: { in: chapterIds } },
    ],
  };
  await db.$transaction([
    db.comment.deleteMany({ where: subjectFilter }),
    db.reaction.deleteMany({ where: subjectFilter }),
    db.book.delete({ where: { id: bookId } }),
  ]);

  if (user.username) revalidatePath(`/${user.username.handle}/books`);
}
