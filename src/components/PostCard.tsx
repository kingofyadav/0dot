import Link from "next/link";
import { toggleLike, toggleBookmark, toggleRepost, deletePost } from "@/app/actions/posts";
import { linkifyPostBody } from "@/lib/linkify";
import { ReplyForm } from "@/app/feed/ReplyForm";

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

type AuthorInfo = {
  profile: { displayName: string; avatarUrl: string | null } | null;
  username: { handle: string } | null;
};

type BasicPost = {
  id: string;
  authorId: string;
  body: string;
  likeCount: number;
  createdAt: Date;
  author: AuthorInfo;
};

export type FeedPost = BasicPost & {
  replyCount: number;
  repostCount: number;
  repostOfId: string | null;
  repostOf: (BasicPost & { deletedAt: Date | null }) | null;
  replies: BasicPost[];
};

function AuthorLine({ author, createdAt }: { author: AuthorInfo; createdAt: Date }) {
  const handle = author.username?.handle;
  const displayName = author.profile?.displayName ?? "Unknown";
  return (
    <div>
      {handle ? (
        <Link href={`/${handle}`} style={{ fontWeight: 700 }}>
          {displayName}
        </Link>
      ) : (
        <span style={{ fontWeight: 700 }}>{displayName}</span>
      )}{" "}
      <span className="mutedText">
        {handle ? `0dot.in/${handle}` : ""} · {relativeTime(createdAt)}
      </span>
    </div>
  );
}

// Read-only inline rendering for a reply or a reposted original — no
// nested reply/repost/bookmark actions one level deep, per phase-1 spec
// §5.3 ("flattens to reply to the original post's thread").
function MiniPostCard({
  post,
  currentUserId,
  variant,
}: {
  post: BasicPost;
  currentUserId?: string | null;
  variant: "reply" | "quoted";
}) {
  const isOwner = currentUserId === post.authorId;
  return (
    <div
      className="profileLinkItem"
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.4rem",
        background: variant === "quoted" ? "color-mix(in srgb, var(--foreground) 3%, transparent)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <AuthorLine author={post.author} createdAt={post.createdAt} />
        {variant === "reply" && isOwner && (
          <form action={deletePost}>
            <input type="hidden" name="postId" value={post.id} />
            <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete reply">
              ✕
            </button>
          </form>
        )}
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{linkifyPostBody(post.body)}</p>
    </div>
  );
}

export function PostCard({
  post,
  isLiked,
  isBookmarked,
  isOwner,
  currentUserId,
}: {
  post: FeedPost;
  isLiked: boolean;
  isBookmarked: boolean;
  isOwner: boolean;
  currentUserId?: string | null;
}) {
  // toggleRepost (src/app/actions/posts.ts) only ever creates empty-body
  // reposts — quote-repost-with-text is schema-supported (spec §5.3) but
  // has no compose UI yet, so repostOfId set implies an empty body here.
  const isRepost = post.repostOfId !== null;

  return (
    <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
      {isRepost && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          ↻ {post.author.profile?.displayName ?? "Someone"} reposted
        </p>
      )}

      {!isRepost && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <AuthorLine author={post.author} createdAt={post.createdAt} />
            {isOwner && (
              <form action={deletePost}>
                <input type="hidden" name="postId" value={post.id} />
                <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete post">
                  ✕
                </button>
              </form>
            )}
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{linkifyPostBody(post.body)}</p>
        </>
      )}

      {isRepost &&
        (post.repostOf && post.repostOf.deletedAt === null ? (
          <MiniPostCard post={post.repostOf} currentUserId={currentUserId} variant="quoted" />
        ) : (
          <p className="mutedText">This post was deleted.</p>
        ))}

      {!isRepost && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <form action={toggleLike}>
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={isLiked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              aria-pressed={isLiked}
            >
              {isLiked ? "♥" : "♡"} {post.likeCount}
            </button>
          </form>

          <form action={toggleRepost}>
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={{ borderColor: "var(--accent-green)", color: "var(--accent-green)" }}
              aria-label="Repost"
            >
              ↻ {post.repostCount}
            </button>
          </form>

          <form action={toggleBookmark}>
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={isBookmarked ? { borderColor: "var(--accent-navy)", color: "var(--accent-navy)" } : undefined}
              aria-pressed={isBookmarked}
              aria-label="Bookmark"
            >
              {isBookmarked ? "🔖" : "📑"}
            </button>
          </form>

          <details className="profileEditToggle" style={{ flex: "1 1 100%", minWidth: 0 }}>
            <summary className="button buttonSecondary iconButton" style={{ display: "inline-block" }}>
              Reply {post.replyCount > 0 ? `(${post.replyCount})` : ""}
            </summary>
            <ReplyForm replyToId={post.id} />
            {post.replies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
                {post.replies.map((reply) => (
                  <MiniPostCard key={reply.id} post={reply} currentUserId={currentUserId} variant="reply" />
                ))}
              </div>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
