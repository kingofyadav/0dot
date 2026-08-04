"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

// phase-7 spec §5.1/§6.1: WikiPage extended with profileId/bookId ownership
// — this file is the "small dedicated action functions per owner type"
// counterpart to src/app/actions/wiki.ts (community-only, unchanged), for
// the two new owner types. Same underlying table and revision mechanics as
// community wiki pages throughout; only the owner FK, permission check, and
// allowed `kind` values differ between the two exported pairs below.

// Same simple format check community wiki.ts uses (not
// slug-validation.ts's reserved-word list) — these slugs are scoped to a
// single profile or book, not a global namespace, so collision risk is low
// (spec §5.1's own framing).
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const VISIBILITY_VALUES = new Set(["public", "unlisted", "private"]);

function parsePosition(raw: FormDataEntryValue | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

type PageFields = { slug: string; title: string; body: string; visibility: string; parentPageId: string | null; position: number };

function parseAndValidatePageFields(formData: FormData): { error: string } | PageFields {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) return { error: "Slug must be lowercase letters, numbers, and hyphens." };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Page content can't be empty." };

  const visibilityRaw = String(formData.get("visibility") ?? "public");
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : "public";

  const parentPageId = String(formData.get("parentPageId") ?? "").trim() || null;
  const position = parsePosition(formData.get("position"));

  return { slug, title, body, visibility, parentPageId, position };
}

// ---------------------------------------------------------------------
// Profile-owned personal wiki / documentation pages (spec §5)
// ---------------------------------------------------------------------

const PROFILE_KIND_VALUES = new Set(["wiki", "documentation"]);

export async function createProfileWikiPage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;

  const fields = parseAndValidatePageFields(formData);
  if ("error" in fields) return fields;

  const kindRaw = String(formData.get("kind") ?? "wiki");
  const kind = PROFILE_KIND_VALUES.has(kindRaw) ? kindRaw : "wiki";

  const existing = await db.wikiPage.findUnique({ where: { profileId_slug: { profileId: profile.id, slug: fields.slug } } });
  if (existing) return { error: "You already have a page with that slug." };

  if (fields.parentPageId) {
    const parent = await db.wikiPage.findUnique({ where: { id: fields.parentPageId }, select: { profileId: true } });
    if (!parent || parent.profileId !== profile.id) return { error: "Invalid parent page." };
  }

  // Nested create + currentRevisionId two-step — same chicken-and-egg
  // resolution as createWikiPage (wiki.ts), unchanged by ownership type.
  const page = await db.wikiPage.create({
    data: {
      profileId: profile.id,
      slug: fields.slug,
      title: fields.title,
      kind,
      parentPageId: fields.parentPageId,
      position: fields.position,
      visibility: fields.visibility,
      revisions: { create: [{ body: fields.body, editedBy: user.id }] },
    },
    include: { revisions: true },
  });
  await db.wikiPage.update({ where: { id: page.id }, data: { currentRevisionId: page.revisions[0].id } });

  if (user.username) revalidatePath(`/${user.username.handle}/wiki`);
  redirect(`/${user.username?.handle}/wiki/${page.slug}`);
}

export async function updateProfileWikiPage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const pageId = String(formData.get("pageId") ?? "");

  const page = await db.wikiPage.findUnique({ where: { id: pageId } });
  if (!page || page.profileId !== profile.id) return { error: "Page not found." };

  const fields = parseAndValidatePageFields(formData);
  if ("error" in fields) return fields;

  const kindRaw = String(formData.get("kind") ?? page.kind);
  const kind = PROFILE_KIND_VALUES.has(kindRaw) ? kindRaw : page.kind;

  if (fields.parentPageId) {
    if (fields.parentPageId === page.id) return { error: "A page can't be its own parent." };
    const parent = await db.wikiPage.findUnique({ where: { id: fields.parentPageId }, select: { profileId: true } });
    if (!parent || parent.profileId !== profile.id) return { error: "Invalid parent page." };
  }

  const revision = await db.wikiRevision.create({ data: { wikiPageId: page.id, body: fields.body, editedBy: user.id } });
  await db.wikiPage.update({
    where: { id: page.id },
    data: {
      title: fields.title,
      kind,
      parentPageId: fields.parentPageId,
      position: fields.position,
      visibility: fields.visibility,
      currentRevisionId: revision.id,
    },
  });

  if (user.username) revalidatePath(`/${user.username.handle}/wiki`);
  revalidatePath(`/${user.username?.handle}/wiki/${page.slug}`);
  return undefined;
}

// Hard-deleted (Reaction/Comment aren't FK'd — see reactions.ts's schema
// comment — so their cleanup is explicit here). Child pages are not
// deleted: parentPageId's onDelete: SetNull promotes them to top-level
// rather than cascading a hierarchy wipe, the safer default for a
// destructive action with no confirmation step of its own.
export async function deleteProfileWikiPage(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) return;

  const page = await db.wikiPage.findUnique({ where: { id: pageId } });
  if (!page || page.profileId !== profile.id) return;

  await db.$transaction([
    db.comment.deleteMany({ where: { subjectType: "wiki_page", subjectId: pageId } }),
    db.reaction.deleteMany({ where: { subjectType: "wiki_page", subjectId: pageId } }),
    db.wikiPage.delete({ where: { id: pageId } }),
  ]);

  if (user.username) revalidatePath(`/${user.username.handle}/wiki`);
}

// ---------------------------------------------------------------------
// Book chapters (spec §6.1) — same table, bookId owner, kind fixed
// ---------------------------------------------------------------------

export async function createBookChapter(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const bookId = String(formData.get("bookId") ?? "");

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book || book.profileId !== profile.id) return { error: "Book not found." };

  const fields = parseAndValidatePageFields(formData);
  if ("error" in fields) return fields;

  const existing = await db.wikiPage.findUnique({ where: { bookId_slug: { bookId, slug: fields.slug } } });
  if (existing) return { error: "This book already has a chapter with that slug." };

  if (fields.parentPageId) {
    const parent = await db.wikiPage.findUnique({ where: { id: fields.parentPageId }, select: { bookId: true } });
    if (!parent || parent.bookId !== bookId) return { error: "Invalid parent chapter." };
  }

  const page = await db.wikiPage.create({
    data: {
      bookId,
      slug: fields.slug,
      title: fields.title,
      kind: "book_chapter",
      parentPageId: fields.parentPageId,
      position: fields.position,
      visibility: fields.visibility,
      revisions: { create: [{ body: fields.body, editedBy: user.id }] },
    },
    include: { revisions: true },
  });
  await db.wikiPage.update({ where: { id: page.id }, data: { currentRevisionId: page.revisions[0].id } });

  if (user.username) revalidatePath(`/${user.username.handle}/books/${book.slug}`);
  redirect(`/${user.username?.handle}/books/${book.slug}/${page.slug}`);
}

export async function updateBookChapter(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const pageId = String(formData.get("pageId") ?? "");

  const page = await db.wikiPage.findUnique({ where: { id: pageId }, include: { book: true } });
  if (!page || !page.book || page.book.profileId !== profile.id) return { error: "Chapter not found." };

  const fields = parseAndValidatePageFields(formData);
  if ("error" in fields) return fields;

  if (fields.parentPageId) {
    if (fields.parentPageId === page.id) return { error: "A chapter can't be its own parent." };
    const parent = await db.wikiPage.findUnique({ where: { id: fields.parentPageId }, select: { bookId: true } });
    if (!parent || parent.bookId !== page.bookId) return { error: "Invalid parent chapter." };
  }

  const revision = await db.wikiRevision.create({ data: { wikiPageId: page.id, body: fields.body, editedBy: user.id } });
  await db.wikiPage.update({
    where: { id: page.id },
    data: {
      title: fields.title,
      parentPageId: fields.parentPageId,
      position: fields.position,
      visibility: fields.visibility,
      currentRevisionId: revision.id,
    },
  });

  if (user.username) revalidatePath(`/${user.username.handle}/books/${page.book.slug}`);
  revalidatePath(`/${user.username?.handle}/books/${page.book.slug}/${page.slug}`);
  return undefined;
}

export async function deleteBookChapter(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const profile = user.profile!;
  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) return;

  const page = await db.wikiPage.findUnique({ where: { id: pageId }, include: { book: true } });
  if (!page || !page.book || page.book.profileId !== profile.id) return;

  await db.$transaction([
    db.comment.deleteMany({ where: { subjectType: "wiki_page", subjectId: pageId } }),
    db.reaction.deleteMany({ where: { subjectType: "wiki_page", subjectId: pageId } }),
    db.wikiPage.delete({ where: { id: pageId } }),
  ]);

  if (user.username) revalidatePath(`/${user.username.handle}/books/${page.book.slug}`);
}
