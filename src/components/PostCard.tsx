import Link from "next/link";
import { toggleLike, toggleBookmark, toggleRepost, deletePost } from "@/app/actions/posts";
import { pinPost, unpinPost, removeCommunityPost } from "@/app/actions/communities";
import { castVote } from "@/app/actions/polls";
import { acceptAnswer, unacceptAnswer } from "@/app/actions/qa";
import { linkifyPostBody } from "@/lib/linkify";
import { flairColorStyle } from "@/lib/flair-colors";
import { ReplyForm } from "@/app/feed/ReplyForm";
import { QuoteRepostForm } from "@/app/feed/QuoteRepostForm";

// Plain helper, not called directly in a component body — same reasoning
// as relativeTime just below: react-hooks/purity flags Date.now() called
// directly inside a component's render, not inside an ordinary function it
// calls into.
function isPollClosed(closesAt: Date): boolean {
  return closesAt.getTime() <= Date.now();
}

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

type MediaItem = { id: string; url: string };

type BasicPost = {
  id: string;
  authorId: string;
  body: string;
  likeCount: number;
  createdAt: Date;
  author: AuthorInfo;
  media: MediaItem[];
  // phase-3 spec §7.1: present on every surface a community post appears
  // on (Home/Explore/community feed alike), not just the community feed —
  // communityId does the pin/remove-form wiring, community the display
  // byline. Optional so /feed and /explore's plain Phase-1/2 posts (which
  // never set these) keep working unchanged.
  communityId?: string | null;
  community?: { name: string; slug: string } | null;
  // phase-3 spec §6: moderator-curated per-community label, same
  // present-everywhere/optional posture as community above.
  flair?: { id: string; label: string; color: string } | null;
  // phase-4 spec §5: when set, AuthorLine shows the business's name/logo
  // instead of the human author's — the human (author above) stays
  // attributable in the data, just not surfaced in the UI. Same optional/
  // present-everywhere posture as community/flair above.
  businessAuthor?: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  // phase-5 spec §4.2: display-only — a row only ever reaches here after
  // already passing getTierGatingCondition's access check, so this badge is
  // purely informational ("this post required a subscription"), not a
  // second gate. Same optional/present-everywhere posture as flair above.
  requiredTier?: { id: string; name: string } | null;
  // phase-3 spec §8: not community-exclusive, same optional/present-
  // everywhere posture. Results always visible (no "hide until you vote").
  poll?: {
    id: string;
    closesAt: Date;
    allowsMultipleChoice: boolean;
    options: { id: string; label: string; _count: { votes: number } }[];
  } | null;
};

function PollBlock({
  poll,
  votedOptionIds,
}: {
  poll: NonNullable<BasicPost["poll"]>;
  votedOptionIds: Set<string>;
}) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o._count.votes, 0);
  const isClosed = isPollClosed(poll.closesAt);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "0.6rem",
      }}
    >
      {poll.options.map((option) => {
        const pct = totalVotes > 0 ? Math.round((option._count.votes / totalVotes) * 100) : 0;
        const voted = votedOptionIds.has(option.id);
        return (
          <form key={option.id} action={castVote}>
            <input type="hidden" name="pollOptionId" value={option.id} />
            <button
              type="submit"
              disabled={isClosed}
              className="button buttonSecondary"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
                borderColor: voted ? "var(--accent)" : undefined,
              }}
            >
              <span
                aria-hidden="true"
                style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--accent-soft)" }}
              />
              <span style={{ position: "relative" }}>
                {voted ? "✓ " : ""}
                {option.label}
              </span>
              <span className="mutedText" style={{ position: "relative", fontSize: "0.8rem" }}>
                {pct}% ({option._count.votes})
              </span>
            </button>
          </form>
        );
      })}
      <p className="mutedText" style={{ fontSize: "0.75rem", margin: 0 }}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"} ·{" "}
        {isClosed ? "Closed" : `Closes ${poll.closesAt.toLocaleDateString()}`}
      </p>
    </div>
  );
}

function FlairPill({ flair }: { flair: { label: string; color: string } }) {
  const style = flairColorStyle(flair.color);
  return (
    <span
      style={{
        ...style,
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.1rem 0.5rem",
        borderRadius: "999px",
        marginInlineStart: "0.4rem",
      }}
    >
      {flair.label}
    </span>
  );
}

export type FeedPost = BasicPost & {
  replyCount: number;
  repostCount: number;
  repostOfId: string | null;
  repostOf: (BasicPost & { deletedAt: Date | null }) | null;
  replies: BasicPost[];
  // phase-3 spec §9: only ever meaningful on a top-level post — replies
  // (BasicPost, not FeedPost) don't carry their own postType/
  // acceptedAnswerId. "standard" for every pre-existing Phase 1/2 post.
  postType: string;
  acceptedAnswerId: string | null;
};

function AuthorLine({
  author,
  createdAt,
  community,
  businessAuthor,
}: {
  author: AuthorInfo;
  createdAt: Date;
  community?: { name: string; slug: string } | null;
  businessAuthor?: { name: string; slug: string; logoUrl: string | null } | null;
}) {
  // phase-4 spec §5: "the post displays with the business's name/logo as
  // the visible author instead of the individual" — the human (author) is
  // simply never rendered here when this is set, even though it's still
  // the real acting identity in the data.
  if (businessAuthor) {
    return (
      <div>
        <Link href={`/b/${businessAuthor.slug}`} style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          {businessAuthor.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
            <img src={businessAuthor.logoUrl} alt="" width={20} height={20} style={{ borderRadius: "50%", objectFit: "cover" }} />
          )}
          {businessAuthor.name}
        </Link>{" "}
        <span className="mutedText">
          0dot.in/b/{businessAuthor.slug} · {relativeTime(createdAt)}
          {community && (
            <>
              {" "}
              in <Link href={`/c/${community.slug}`}>{community.name}</Link>
            </>
          )}
        </span>
      </div>
    );
  }

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
        {community && (
          <>
            {" "}
            in <Link href={`/c/${community.slug}`}>{community.name}</Link>
          </>
        )}
      </span>
    </div>
  );
}

function PostMediaGrid({ media }: { media: MediaItem[] }) {
  if (media.length === 0) return null;
  const columns = media.length === 1 ? 1 : 2;
  return (
    <div className="postMediaGrid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {media.map((item) => (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded content, not an optimizable static asset
        <img key={item.id} src={item.url} alt="" className="postMediaItem" />
      ))}
    </div>
  );
}

// Read-only inline rendering for a reply or a reposted original — no
// nested reply/repost/bookmark actions one level deep, per phase-1 spec
// §5.3 ("flattens to reply to the original post's thread"). Media is
// summarized as a count rather than a full grid, to avoid a media grid
// nested inside another card.
function MiniPostCard({
  post,
  currentUserId,
  variant,
  // phase-3 spec §9: only ever passed for a reply under a question post
  // (see PostCard's replies.map below) — quoted originals never get these.
  questionId,
  isAcceptedAnswer,
  canAcceptAnswer,
}: {
  post: BasicPost;
  currentUserId?: string | null;
  variant: "reply" | "quoted";
  questionId?: string;
  isAcceptedAnswer?: boolean;
  canAcceptAnswer?: boolean;
}) {
  const isOwner = currentUserId === post.authorId;
  return (
    <div
      id={`post-${post.id}`}
      className="profileLinkItem"
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.4rem",
        background: variant === "quoted" ? "color-mix(in srgb, var(--foreground) 3%, transparent)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ display: "flex", alignItems: "baseline" }}>
          <AuthorLine author={post.author} createdAt={post.createdAt} community={post.community} businessAuthor={post.businessAuthor} />
          {isAcceptedAnswer && (
            <span className="mutedText" style={{ marginInlineStart: "0.4rem", fontSize: "0.8rem", color: "var(--accent-green)" }}>
              ✓ Accepted answer
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: "0.3rem" }}>
          {canAcceptAnswer && questionId && (
            <form action={isAcceptedAnswer ? unacceptAnswer : acceptAnswer}>
              <input type="hidden" name="questionId" value={questionId} />
              {!isAcceptedAnswer && <input type="hidden" name="replyId" value={post.id} />}
              <button type="submit" className="button buttonSecondary buttonSmall">
                {isAcceptedAnswer ? "Unaccept" : "Accept answer"}
              </button>
            </form>
          )}
          {variant === "reply" && isOwner && (
            <form action={deletePost}>
              <input type="hidden" name="postId" value={post.id} />
              <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete reply">
                ✕
              </button>
            </form>
          )}
        </span>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {linkifyPostBody(post.body)}
        {post.media.length > 0 && (
          <span className="mutedText"> 📷 {post.media.length} photo{post.media.length === 1 ? "" : "s"}</span>
        )}
      </p>
    </div>
  );
}

export function PostCard({
  post,
  isLiked,
  isBookmarked,
  isOwner,
  currentUserId,
  isPinned,
  canModerate,
  votedOptionIds,
}: {
  post: FeedPost;
  isLiked: boolean;
  isBookmarked: boolean;
  isOwner: boolean;
  currentUserId?: string | null;
  // Community-feed-only (src/app/c/[slug]/CommunityFeedList.tsx) — both
  // default falsy, so /feed and /explore's existing calls (which never
  // pass either) render exactly as before.
  isPinned?: boolean;
  canModerate?: boolean;
  // phase-3 spec §8: which of this post's poll options (if any) the viewer
  // has already voted for — same optional/"only relevant when there's a
  // poll" posture as the props above. Defaults to empty so callers that
  // never fetch poll votes (not worth the query on a page with no polls)
  // still render correctly.
  votedOptionIds?: Set<string>;
}) {
  const isRepost = post.repostOfId !== null;
  const isQuoteRepost = isRepost && post.body.trim().length > 0;
  const isPureRepost = isRepost && !isQuoteRepost;

  return (
    // id used as a like/reply notification deep-link target (no post
    // permalink page exists yet — see src/lib/notifications.ts). Can, in
    // principle, collide with MiniPostCard rendering the same post inline
    // elsewhere on the same page (e.g. as a quoted original) — accepted,
    // not fixed here; the browser just jumps to the first match.
    <div
      id={`post-${post.id}`}
      className="profileLinkItem"
      style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}
    >
      {isPureRepost && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          ↻ {post.author.profile?.displayName ?? "Someone"} reposted
        </p>
      )}

      {isPinned && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          📌 Pinned
        </p>
      )}

      {!isPureRepost && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ display: "flex", alignItems: "baseline" }}>
              <AuthorLine author={post.author} createdAt={post.createdAt} community={post.community} businessAuthor={post.businessAuthor} />
              {post.flair && <FlairPill flair={post.flair} />}
              {post.postType === "question" && (
                <span className="mutedText" style={{ marginInlineStart: "0.4rem", fontSize: "0.8rem" }}>
                  ❓ Question
                </span>
              )}
              {post.requiredTier && (
                <span className="mutedText" style={{ marginInlineStart: "0.4rem", fontSize: "0.8rem" }}>
                  🔒 {post.requiredTier.name} subscribers
                </span>
              )}
            </span>
            <span style={{ display: "flex", gap: "0.3rem" }}>
              {canModerate && (
                <form action={isPinned ? unpinPost : pinPost}>
                  <input type="hidden" name="communityId" value={post.communityId ?? ""} />
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    className="button buttonSecondary iconButton"
                    aria-label={isPinned ? "Unpin post" : "Pin post"}
                  >
                    📌
                  </button>
                </form>
              )}
              {isOwner && (
                <form action={deletePost}>
                  <input type="hidden" name="postId" value={post.id} />
                  <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete post">
                    ✕
                  </button>
                </form>
              )}
              {canModerate && !isOwner && (
                <form action={removeCommunityPost}>
                  <input type="hidden" name="communityId" value={post.communityId ?? ""} />
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    className="button buttonSecondary iconButton"
                    aria-label="Remove post (moderator)"
                    title="Remove post (moderator)"
                  >
                    🛡✕
                  </button>
                </form>
              )}
            </span>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{linkifyPostBody(post.body)}</p>
          <PostMediaGrid media={post.media} />
          {post.poll && <PollBlock poll={post.poll} votedOptionIds={votedOptionIds ?? new Set()} />}
        </>
      )}

      {isRepost &&
        (post.repostOf && post.repostOf.deletedAt === null ? (
          <MiniPostCard post={post.repostOf} currentUserId={currentUserId} variant="quoted" />
        ) : (
          <p className="mutedText">This post was deleted.</p>
        ))}

      {!isPureRepost && (
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
              Quote
            </summary>
            <QuoteRepostForm
              postId={post.id}
              authorName={post.author.profile?.displayName ?? "Unknown"}
              bodyPreview={post.body.slice(0, 80)}
            />
          </details>

          <details className="profileEditToggle" style={{ flex: "1 1 100%", minWidth: 0 }}>
            <summary className="button buttonSecondary iconButton" style={{ display: "inline-block" }}>
              Reply {post.replyCount > 0 ? `(${post.replyCount})` : ""}
            </summary>
            <ReplyForm replyToId={post.id} />
            {post.replies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
                {post.replies.map((reply) => (
                  <MiniPostCard
                    key={reply.id}
                    post={reply}
                    currentUserId={currentUserId}
                    variant="reply"
                    questionId={post.postType === "question" ? post.id : undefined}
                    isAcceptedAnswer={post.acceptedAnswerId === reply.id}
                    canAcceptAnswer={post.postType === "question" && (isOwner || Boolean(canModerate))}
                  />
                ))}
              </div>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
