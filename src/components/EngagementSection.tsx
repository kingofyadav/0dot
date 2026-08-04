import { toggleReaction, deleteComment } from "@/app/actions/reactions";
import { SubjectCommentForm } from "./SubjectCommentForm";

type EngagementComment = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
};

// Shared like/comment block for the wiki_page/book/published_file subject
// types (spec §4) — Article's permalink page predates this and keeps its
// own inline version (already live/tested), but three call sites past that
// is where duplicating this exact markup a third time stops being worth it.
export function EngagementSection({
  subjectType,
  subjectId,
  likeCount,
  isLiked,
  currentUserId,
  ownerId,
  comments,
  showCommentForm,
}: {
  subjectType: string;
  subjectId: string;
  likeCount: number;
  isLiked: boolean;
  currentUserId: string | null;
  ownerId: string;
  comments: EngagementComment[];
  showCommentForm: boolean;
}) {
  return (
    <>
      <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem" }}>
        {currentUserId ? (
          <form action={toggleReaction}>
            <input type="hidden" name="subjectType" value={subjectType} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={isLiked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              aria-pressed={isLiked}
            >
              {isLiked ? "♥" : "♡"} {likeCount}
            </button>
          </form>
        ) : (
          <span className="mutedText" style={{ fontSize: "0.85rem" }}>♡ {likeCount}</span>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <p className="sectionHeading">Comments ({comments.length})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comments.map((comment) => (
            <div key={comment.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.2rem" }}>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>{comment.authorName}</span>
              <span>{comment.body}</span>
              {currentUserId && (currentUserId === comment.authorId || currentUserId === ownerId) && (
                <form action={deleteComment} style={{ alignSelf: "flex-end" }}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete comment">✕</button>
                </form>
              )}
            </div>
          ))}
        </div>
        {showCommentForm && currentUserId && <SubjectCommentForm subjectType={subjectType} subjectId={subjectId} />}
      </div>
    </>
  );
}
