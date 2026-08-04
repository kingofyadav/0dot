import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { listBookChapters } from "@/lib/wiki";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { EngagementSection } from "@/components/EngagementSection";

export default async function BookPage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username: rawParam, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const book = await db.book.findUnique({ where: { profileId_slug: { profileId: username.user.profile.id, slug } } });
  if (!book) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.user.id;
  if (!isOwner && (book.status !== "published" || book.visibility === "private")) notFound();

  const allChapters = await listBookChapters(book.id);
  const chapters = isOwner ? allChapters : allChapters.filter((c) => c.visibility !== "private");

  const [comments, isLiked] = await Promise.all([
    db.comment.findMany({
      where: { subjectType: "book", subjectId: book.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { username: true, profile: true } } },
    }),
    currentUser
      ? db.reaction.findUnique({ where: { subjectType_subjectId_userId: { subjectType: "book", subjectId: book.id, userId: currentUser.id } } })
      : null,
  ]);

  return (
    <div className="profileCard">
      <Link href={`/${handle}/books`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}&rsquo;s books
      </Link>

      {book.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img src={book.coverImageUrl} alt="" style={{ width: "100%", borderRadius: "10px", marginTop: "0.6rem", maxHeight: "320px", objectFit: "cover" }} />
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{book.title}</h1>
      <p className="mutedText" style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
        {book.status === "draft" && "Draft"}
        {book.visibility === "unlisted" && " · Unlisted"}
        {book.visibility === "private" && " · Private"}
      </p>

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${handle}/content/books#book-${book.id}`} className="button buttonSecondary buttonSmall">
            Edit book
          </Link>
        </div>
      )}

      {book.description && <div style={{ marginTop: "0.75rem" }}>{renderWikiMarkdown(book.description)}</div>}

      {book.ebookFileUrl && (
        <div style={{ marginTop: "0.75rem" }}>
          <a href={book.ebookFileUrl} className="button buttonSecondary buttonSmall" download>
            Download ebook
          </a>
        </div>
      )}

      {chapters.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Chapters</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {chapters.map((chapter, index) => (
              <Link key={chapter.id} href={`/${handle}/books/${book.slug}/${chapter.slug}`} className="profileLinkItem">
                {index + 1}. {chapter.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <EngagementSection
        subjectType="book"
        subjectId={book.id}
        likeCount={book.likeCount}
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
