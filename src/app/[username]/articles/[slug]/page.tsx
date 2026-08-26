import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { toggleReaction, deleteComment } from "@/app/actions/reactions";
import { ArticleCommentForm } from "./ArticleCommentForm";
import { TranslateArticleButton } from "./TranslateArticleButton";
import { ConfirmButton } from "@/components/ConfirmButton";

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };
const LICENSE_LABEL: Record<string, string> = {
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  cc_by_nc: "CC BY-NC",
  cc_by_nd: "CC BY-ND",
  cc0: "CC0",
  custom: "Custom license",
};

export default async function ArticlePage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username: rawParam, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username) notFound();

  const article = await db.article.findUnique({
    where: { authorId_slug: { authorId: username.userId, slug } },
    include: { hashtags: { include: { hashtag: true } } },
  });
  if (!article) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === article.authorId;

  // spec §3.2: `private` is real, server-enforced access control (unlike
  // Project's obscurity-only `unlisted`) — author only, full stop. A draft
  // is also owner-only regardless of visibility, same "owner sees it
  // regardless of status" gate the Course permalink page already uses.
  if (!isOwner && (article.status !== "published" || article.visibility === "private")) {
    notFound();
  }

  const comments = await db.comment.findMany({
    where: { subjectType: "article", subjectId: article.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { author: { include: { username: true, profile: true } } },
  });
  // phase-13 spec §5.1: absence of a row means all_rights_reserved — the
  // default under standard copyright law, not something that needs its own
  // ContentLicense row to be true.
  const license = await db.contentLicense.findUnique({
    where: { subjectType_subjectId: { subjectType: "article", subjectId: article.id } },
  });
  const isLiked = currentUser
    ? Boolean(
        await db.reaction.findUnique({
          where: { subjectType_subjectId_userId: { subjectType: "article", subjectId: article.id, userId: currentUser.id } },
        })
      )
    : false;

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile?.displayName ?? handle}
      </Link>

      {article.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img src={article.coverImageUrl} alt="" style={{ width: "100%", borderRadius: "10px", marginTop: "0.6rem", maxHeight: "320px", objectFit: "cover" }} />
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{article.title}</h1>
      {article.subtitle && <p className="mutedText" style={{ marginTop: "0.2rem" }}>{article.subtitle}</p>}

      <p className="mutedText" style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
        {FORMAT_LABEL[article.format]} · {article.readingTimeMinutes} min read
        {article.status === "draft" && " · Draft"}
        {article.visibility === "unlisted" && " · Unlisted"}
        {article.visibility === "private" && " · Private"}
        {license && license.licenseType !== "all_rights_reserved" && ` · ${LICENSE_LABEL[license.licenseType] ?? license.licenseType}`}
      </p>

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${handle}/content/articles#article-${article.id}`} className="button buttonSecondary buttonSmall">
            Edit article
          </Link>
        </div>
      )}

      {article.body && <div style={{ marginTop: "0.75rem" }}>{renderWikiMarkdown(article.body)}</div>}

      {article.body && <TranslateArticleButton articleId={article.id} />}

      {article.hashtags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.75rem" }}>
          {article.hashtags.map(({ hashtag }) => (
            <span key={hashtag.id} className="mutedText" style={{ fontSize: "0.8rem", border: "1px solid var(--border)", borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
              #{hashtag.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem" }}>
        {currentUser && (
          <form action={toggleReaction}>
            <input type="hidden" name="subjectType" value="article" />
            <input type="hidden" name="subjectId" value={article.id} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                ...(isLiked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined),
              }}
              aria-pressed={isLiked}
            >
              <Heart size={16} aria-hidden="true" fill={isLiked ? "currentColor" : "none"} /> {article.likeCount}
            </button>
          </form>
        )}
        {!currentUser && (
          <span className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
            <Heart size={14} aria-hidden="true" /> {article.likeCount}
          </span>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <p className="sectionHeading">Comments ({article.commentCount})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comments.map((comment) => (
            <div key={comment.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.2rem" }}>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {comment.author.profile?.displayName ?? comment.author.username?.handle ?? "Unknown"}
              </span>
              <span>{comment.body}</span>
              {currentUser && (currentUser.id === comment.authorId || currentUser.id === article.authorId) && (
                <form action={deleteComment} style={{ alignSelf: "flex-end" }}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this comment?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete comment"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </div>
        {currentUser && <ArticleCommentForm articleId={article.id} />}
      </div>
    </div>
  );
}
