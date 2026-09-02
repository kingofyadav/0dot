import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { getBookChapter } from "@/lib/wiki";

// Bearer-token counterpart to
// src/app/[username]/books/[slug]/[chapterSlug]/page.tsx — a chapter's own
// body + sub-sections. v1 scope: reading only, same as the article/wiki
// detail routes.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; slug: string; chapterSlug: string }> }
) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle, slug: rawBookSlug, chapterSlug: rawChapterSlug } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const bookSlug = decodeURIComponent(rawBookSlug).toLowerCase();
  const chapterSlug = decodeURIComponent(rawChapterSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const book = await db.book.findUnique({ where: { profileId_slug: { profileId: username.user.profile.id, slug: bookSlug } } });
  if (!book) return apiError("Not found.", 404);

  const isOwner = ctx.userId === username.user.id;
  if (!isOwner && (book.status !== "published" || book.visibility === "private")) return apiError("Not found.", 404);

  const chapter = await getBookChapter(book.id, chapterSlug);
  if (!chapter) return apiError("Not found.", 404);
  if (!isOwner && chapter.visibility === "private") return apiError("Not found.", 404);

  return Response.json(
    {
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      visibility: chapter.visibility,
      body: chapter.currentRevision?.body ?? "",
      isOwner,
      parent: chapter.parent ? { slug: chapter.parent.slug, title: chapter.parent.title } : null,
      children: chapter.children
        .filter((child) => isOwner || child.visibility !== "private")
        .map((child) => ({ id: child.id, slug: child.slug, title: child.title })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
