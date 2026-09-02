import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { listBookChapters } from "@/lib/wiki";

// Bearer-token counterpart to src/app/[username]/books/[slug]/page.tsx —
// book metadata + the top-level chapter list (titles only; a chapter's own
// body is GET .../books/[slug]/[chapterSlug], mirroring the web page's own
// split into a book page + a per-chapter page).
export async function GET(request: Request, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const book = await db.book.findUnique({ where: { profileId_slug: { profileId: username.user.profile.id, slug } } });
  if (!book) return apiError("Not found.", 404);

  const isOwner = ctx.userId === username.user.id;
  if (!isOwner && (book.status !== "published" || book.visibility === "private")) return apiError("Not found.", 404);

  const allChapters = await listBookChapters(book.id);
  const chapters = isOwner ? allChapters : allChapters.filter((c) => c.visibility !== "private");

  return Response.json(
    {
      id: book.id,
      slug: book.slug,
      title: book.title,
      description: book.description,
      coverImageUrl: book.coverImageUrl,
      ebookFileUrl: book.ebookFileUrl,
      status: book.status,
      visibility: book.visibility,
      likeCount: book.likeCount,
      commentCount: book.commentCount,
      isOwner,
      chapters: chapters.map((c) => ({ id: c.id, slug: c.slug, title: c.title })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
