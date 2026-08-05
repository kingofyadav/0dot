"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveUploadedImage } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateArticleSlugFormat } from "@/lib/reserved-article-slugs";
import { recordContentRevision } from "@/lib/content-revisions";
import type { ActionState } from "@/app/actions/auth";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TAGS = 8;
const FORMAT_VALUES = new Set(["article", "tutorial", "note"]);
const STATUS_VALUES = new Set(["draft", "published"]);
const VISIBILITY_VALUES = new Set(["public", "unlisted", "private"]);
const WORDS_PER_MINUTE = 200;

function checkArticleWriteRateLimit(userId: string): boolean {
  return checkRateLimit(`article:write:user:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

function computeReadingTimeMinutes(body: string): number {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

// Author-supplied structured tags (spec §3.1) — a comma-separated field the
// author fills in directly, not parsed from inline #hashtag mentions in the
// body the way Post's are (src/lib/linkify.tsx). Normalized the same
// trimmed/lowercased-for-comparison way Skill.name is.
function parseTags(formData: FormData): string[] {
  const raw = String(formData.get("tags") ?? "");
  const tags = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 30);
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

// Replace-all-on-save, same shape syncProjectSkills (projects.ts) already
// established for a small owner-curated join table with no attributes of
// its own. Hashtag rows are upserted by name first since this is the first
// persisted hashtag structure in the codebase (see schema comment) — no
// prior write path exists to reuse.
async function syncArticleHashtags(articleId: string, tagNames: string[]): Promise<void> {
  const hashtags = await Promise.all(
    tagNames.map((name) => db.hashtag.upsert({ where: { name }, update: {}, create: { name } }))
  );
  await db.$transaction([
    db.articleHashtag.deleteMany({ where: { articleId } }),
    ...(hashtags.length
      ? [db.articleHashtag.createMany({ data: hashtags.map((h) => ({ articleId, hashtagId: h.id })) })]
      : []),
  ]);
}

type ArticleFields = {
  title: string;
  subtitle: string | null;
  format: string;
  body: string;
  status: string;
  visibility: string;
};

function parseAndValidateArticleFields(formData: FormData): { error: string } | ArticleFields {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1-200 characters." };

  const subtitleRaw = String(formData.get("subtitle") ?? "").trim();
  if (subtitleRaw.length > 300) return { error: "Subtitle must be 300 characters or fewer." };
  const subtitle = subtitleRaw.length > 0 ? subtitleRaw : null;

  const formatRaw = String(formData.get("format") ?? "article");
  const format = FORMAT_VALUES.has(formatRaw) ? formatRaw : "article";

  const body = String(formData.get("body") ?? "").trim();

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "draft";

  const visibilityRaw = String(formData.get("visibility") ?? "public");
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : "public";

  return { title, subtitle, format, body, status, visibility };
}

// spec §3.1/§3.4: slug validated the same shared way usernames/communities/
// businesses/projects are, but scoped per-author (@@unique([authorId,
// slug])) rather than checked against a global namespace — see
// reserved-article-slugs.ts.
export async function createArticle(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkArticleWriteRateLimit(user.id)) {
    return { error: "You're publishing too fast. Please slow down." };
  }

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const slugError = validateArticleSlugFormat(slug);
  if (slugError === "invalid_format") {
    return { error: "Slug must be 3-80 characters: letters, numbers, underscore only." };
  }
  if (slugError === "reserved") {
    return { error: "That slug is reserved." };
  }
  const existingSlug = await db.article.findUnique({ where: { authorId_slug: { authorId: user.id, slug } } });
  if (existingSlug) return { error: "You already have an article with that slug." };

  const fields = parseAndValidateArticleFields(formData);
  if ("error" in fields) return fields;

  let coverImageUrl: string | undefined;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  const isPublishing = fields.status === "published";

  const article = await db.article.create({
    data: {
      authorId: user.id,
      slug,
      ...fields,
      coverImageUrl,
      readingTimeMinutes: isPublishing ? computeReadingTimeMinutes(fields.body) : 0,
      publishedAt: isPublishing ? new Date() : null,
    },
  });

  await syncArticleHashtags(article.id, parseTags(formData));

  if (user.username) revalidatePath(`/${user.username.handle}/articles`);
  redirect(`/${user.username?.handle}/articles/${article.slug}`);
}

export async function updateArticle(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const articleId = String(formData.get("articleId") ?? "");

  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article) return { error: "Article not found." };
  if (article.authorId !== user.id) return { error: "You don't have permission to manage this article." };

  const fields = parseAndValidateArticleFields(formData);
  if ("error" in fields) return fields;

  let coverImageUrl = article.coverImageUrl;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { maxBytes: MAX_IMAGE_BYTES, uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  // publishedAt is set once, the first time an article transitions out of
  // draft — re-saving an already-published article (or editing while still
  // a draft) never touches it. readingTimeMinutes recomputes on every save
  // while published, since an edit can change the word count.
  const isPublishing = fields.status === "published";
  const publishedAt = isPublishing ? (article.publishedAt ?? new Date()) : null;

  // phase-13 spec §3.3: the ContentRevision row is created before the
  // update is visible, not after — both writes share one transaction.
  await db.$transaction(async (tx) => {
    await recordContentRevision(tx, "article", article.id, fields.body, user.id);
    await tx.article.update({
      where: { id: article.id },
      data: {
        ...fields,
        coverImageUrl,
        readingTimeMinutes: isPublishing ? computeReadingTimeMinutes(fields.body) : article.readingTimeMinutes,
        publishedAt,
      },
    });
  });
  await syncArticleHashtags(article.id, parseTags(formData));

  if (user.username) revalidatePath(`/${user.username.handle}/articles`);
  revalidatePath(`/${user.username?.handle}/articles/${article.slug}`);
  return undefined;
}

// Hard-deleted (unlike Post/ProjectComment's soft-delete convention) — an
// Article's like/comment rows aren't FK'd to it (Reaction/Comment's
// subjectType/subjectId is a polymorphic pair, not a real foreign key, per
// the schema comment), so they're cleaned up here at the app layer rather
// than via onDelete: Cascade.
export async function deleteArticle(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const articleId = String(formData.get("articleId") ?? "");
  if (!articleId) return;

  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article || article.authorId !== user.id) return;

  await db.$transaction([
    db.comment.deleteMany({ where: { subjectType: "article", subjectId: articleId } }),
    db.reaction.deleteMany({ where: { subjectType: "article", subjectId: articleId } }),
    db.article.delete({ where: { id: articleId } }),
  ]);

  if (user.username) revalidatePath(`/${user.username.handle}/articles`);
}
