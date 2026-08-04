import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBookChapter } from "@/lib/wiki";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { EngagementSection } from "@/components/EngagementSection";

export default async function BookChapterPage({
  params,
}: {
  params: Promise<{ username: string; slug: string; chapterSlug: string }>;
}) {
  const { username: rawParam, slug: bookSlug, chapterSlug: rawChapterSlug } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const bookSlugLower = decodeURIComponent(bookSlug).toLowerCase();
  const chapterSlug = decodeURIComponent(rawChapterSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const book = await db.book.findUnique({ where: { profileId_slug: { profileId: username.user.profile.id, slug: bookSlugLower } } });
  if (!book) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.user.id;
  if (!isOwner && (book.status !== "published" || book.visibility === "private")) notFound();

  const chapter = await getBookChapter(book.id, chapterSlug);
  if (!chapter) notFound();
  if (!isOwner && chapter.visibility === "private") notFound();

  const [comments, isLiked, likeCount] = await Promise.all([
    db.comment.findMany({
      where: { subjectType: "wiki_page", subjectId: chapter.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { username: true, profile: true } } },
    }),
    currentUser
      ? db.reaction.findUnique({ where: { subjectType_subjectId_userId: { subjectType: "wiki_page", subjectId: chapter.id, userId: currentUser.id } } })
      : null,
    db.reaction.count({ where: { subjectType: "wiki_page", subjectId: chapter.id } }),
  ]);

  return (
    <div className="profileCard">
      <Link href={`/${handle}/books/${book.slug}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {book.title}
      </Link>
      {chapter.parent && (
        <div>
          <Link href={`/${handle}/books/${book.slug}/${chapter.parent.slug}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
            ↑ {chapter.parent.title}
          </Link>
        </div>
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{chapter.title}</h1>
      {chapter.visibility && chapter.visibility !== "public" && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          {chapter.visibility === "unlisted" ? "Unlisted" : "Private"}
        </p>
      )}

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${handle}/content/books#book-${book.id}`} className="button buttonSecondary buttonSmall">
            Edit chapter
          </Link>
        </div>
      )}

      {chapter.currentRevision && <div style={{ marginTop: "0.75rem" }}>{renderWikiMarkdown(chapter.currentRevision.body)}</div>}

      {chapter.children.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Sub-sections</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {chapter.children
              .filter((child) => isOwner || child.visibility !== "private")
              .map((child) => (
                <Link key={child.id} href={`/${handle}/books/${book.slug}/${child.slug}`} className="profileLinkItem">
                  {child.title}
                </Link>
              ))}
          </div>
        </div>
      )}

      <EngagementSection
        subjectType="wiki_page"
        subjectId={chapter.id}
        likeCount={likeCount}
        isLiked={Boolean(isLiked)}
        currentUserId={currentUser?.id ?? null}
        ownerId={username.user.id}
        showCommentForm
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorId: c.authorId,
          authorName: c.author.profile?.displayName ?? c.author.username?.handle ?? "Unknown",
        }))}
      />
    </div>
  );
}
