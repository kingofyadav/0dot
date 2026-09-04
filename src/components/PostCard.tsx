import Link from "next/link";
import Image from "next/image";
import {
  BadgeCheck,
  Bookmark,
  Camera,
  Check,
  CircleHelp,
  Lock,
  MessageCircle,
  Pin,
  Quote,
  Repeat2,
  ShieldX,
  X,
} from "lucide-react";
import { toggleBookmark, toggleRepost, deletePost } from "@/app/actions/posts";
import { pinPost, unpinPost, removeCommunityPost } from "@/app/actions/communities";
import { acceptAnswer, unacceptAnswer } from "@/app/actions/qa";
import { linkifyPostBody, splitPostBody } from "@/lib/linkify";
import { flairColorStyle } from "@/lib/flair-colors";
import { formatCount } from "@/lib/format";
import { ReplyForm } from "@/app/feed/ReplyForm";
import { QuoteRepostForm } from "@/app/feed/QuoteRepostForm";
import { ReportButton } from "@/components/ReportButton";
import { PostOwnerMenu } from "@/app/feed/PostOwnerMenuLazy";
import { ConfirmButton } from "@/components/ConfirmButton";
import { LikeButton } from "@/components/LikeButton";
import { PollBlock } from "@/components/PollBlock";
import { Avatar } from "@/components/Avatar";

// Redesign Phase 1b: the avatar column for a post row. Resolves to the
// business logo + business route when the post is attributed to a business
// (phase-4 §5), otherwise the human author's avatar + profile route.
function postAvatarProps(post: BasicPost): { src: string | null; alt: string; href: string | null } {
  if (post.businessAuthor) {
    return { src: post.businessAuthor.logoUrl, alt: post.businessAuthor.name, href: `/b/${post.businessAuthor.slug}` };
  }
  const handle = post.author.username?.handle ?? null;
  return {
    src: post.author.profile?.avatarUrl ?? null,
    alt: post.author.profile?.displayName ?? "Unknown",
    href: handle ? `/${handle}` : null,
  };
}

function PostAvatar({ post, size }: { post: BasicPost; size: number }) {
  const { src, alt, href } = postAvatarProps(post);
  const img = <Avatar src={src} alt={alt} size={size} className="postAvatar" />;
  // prefetch={false}: every post row in a feed renders this — a feed of N
  // posts would otherwise fire N concurrent RSC prefetches (each running
  // its own profile/business page's DB reads) just from scrolling into
  // view. Same DB-connection-burst-503 fix as NavLinks.tsx and the
  // marketing/auth pages; every other Link in this file gets the same
  // treatment for the same reason.
  return href ? (
    <Link href={href} prefetch={false} className="postAvatarLink" aria-label={alt} tabIndex={-1}>
      {img}
    </Link>
  ) : (
    img
  );
}

// Replies stay flat/inline (phase-1 spec §5.3) but a busy thread shouldn't
// dump every reply into view the moment "Reply (N)" is opened — the first
// few render immediately, the rest sit behind their own "View all"
// disclosure one level deeper (same nested-progressive-disclosure posture
// as the reply toggle itself).
const INLINE_REPLY_PREVIEW_COUNT = 3;

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
        {/* Redesign Phase 1b: the logo moved out to the byline avatar
            (postAvatarProps below) so every post row leads with a consistent
            avatar column instead of a small inline mark on business posts
            only. */}
        <Link href={`/b/${businessAuthor.slug}`} prefetch={false} style={{ fontWeight: 700 }}>
          {businessAuthor.name}
        </Link>
        {/* Blue tick button, shown for every business post — single click
            straight to the business's public profile. */}
        <Link href={`/b/${businessAuthor.slug}`} prefetch={false} className="verifiedBadge" aria-label="View public profile" title="View public profile">
          <BadgeCheck size={14} aria-hidden="true" />
        </Link>{" "}
        <span className="mutedText">
          {relativeTime(createdAt)}
          {community && (
            <>
              {" "}
              in <Link href={`/c/${community.slug}`} prefetch={false}>{community.name}</Link>
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
        <Link href={`/${handle}`} prefetch={false} style={{ fontWeight: 700 }}>
          {displayName}
        </Link>
      ) : (
        <span style={{ fontWeight: 700 }}>{displayName}</span>
      )}
      {/* Blue tick button, shown for every post — single click straight to
          the author's public profile. Same treatment as businessAuthor's
          badge above, and mirrored in the messages section (ConversationListItem,
          MessagesBadge, the conversation header, and message requests) and in
          follower/following rows (UserListItem) so the same "go to public
          profile" button is available everywhere a name shows up. */}
      {handle && (
        <Link href={`/${handle}`} prefetch={false} className="verifiedBadge" aria-label="View public profile" title="View public profile">
          <BadgeCheck size={14} aria-hidden="true" />
        </Link>
      )}{" "}
      <span className="mutedText">
        {relativeTime(createdAt)}
        {community && (
          <>
            {" "}
            in <Link href={`/c/${community.slug}`} prefetch={false}>{community.name}</Link>
          </>
        )}
      </span>
    </div>
  );
}

// <details> rather than a client toggle — same "native element over
// hand-rolled JS" posture as the rest of this file's disclosures — wrapped
// in a <div> (not <p>) because <details> is flow content and isn't valid
// inside a <p>.
function PostBody({ body }: { body: string }) {
  const { shown, rest } = splitPostBody(body);
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {linkifyPostBody(shown)}
      {rest && (
        <details style={{ display: "inline" }}>
          <summary style={{ display: "inline", cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>
            {" "}
            Show more
          </summary>
          {linkifyPostBody(rest)}
        </details>
      )}
    </div>
  );
}

// `priority`: only ever true for the very first image of the very first
// post in a list (each caller passes it just for index === 0) — Lighthouse
// confirmed live on 0dot.in/feed that this exact image is the page's LCP
// element (largest-contentful-paint scored 0.26/1 — the single biggest
// weighted metric in the Performance category), and a plain <img
// loading="lazy"> actively deferred it despite already being above the
// fold. next/image with `fill` (blob storage is already in next.config.ts's
// images.remotePatterns) gets it a same-domain optimized/responsive
// source, correct `loading`/`fetchPriority`, and no separate img-src
// allowlist entry needed. `fill` needs a sized, positioned ancestor —
// .postMediaItem already is one (fixed aspect-ratio, width:100%), moved
// from the <img> itself to this wrapper.
function PostMediaGrid({ media, authorName, priority = false }: { media: MediaItem[]; authorName: string; priority?: boolean }) {
  if (media.length === 0) return null;
  const columns = media.length === 1 ? 1 : 2;
  return (
    <div className="postMediaGrid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {media.map((item, index) => (
        // No per-image caption exists in the data model yet (MediaItem is
        // just {id, url}) — this generic description is meaningfully better
        // than empty alt="" (which claims the image is decorative, when
        // it's the actual content someone is looking at) without a data
        // model change to add real author-authored captions.
        <div key={item.id} className="postMediaItem" style={{ position: "relative" }}>
          <Image
            src={item.url}
            alt={`Image ${index + 1} posted by ${authorName}`}
            fill
            sizes={columns === 1 ? "(max-width: 640px) 100vw, 640px" : "(max-width: 640px) 50vw, 320px"}
            style={{ objectFit: "cover" }}
            priority={priority && index === 0}
          />
        </div>
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
      className="postCardNested"
      style={{
        background: variant === "quoted" ? "color-mix(in srgb, var(--foreground) 3%, transparent)" : undefined,
      }}
    >
      <div className="postHeaderRow">
        <PostAvatar post={post} size={28} />
        <div className="postHeaderMain">
          <AuthorLine author={post.author} createdAt={post.createdAt} community={post.community} businessAuthor={post.businessAuthor} />
          {isAcceptedAnswer && (
            <span
              className="mutedText"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginInlineStart: "0.4rem", fontSize: "0.8rem", color: "var(--accent)" }}
            >
              <Check size={14} aria-hidden="true" /> Accepted answer
            </span>
          )}
        </div>
        <span className="row-sm">
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
              <ConfirmButton
                className="button buttonSecondary iconButton"
                aria-label="Delete reply"
                title="Delete this reply?"
                description="This can't be undone. The reply will be permanently removed."
                confirmLabel="Delete"
              >
                <X size={16} aria-hidden="true" />
              </ConfirmButton>
            </form>
          )}
        </span>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {linkifyPostBody(post.body)}
        {post.media.length > 0 && (
          <span className="mutedText">
            {" "}
            <Camera size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {post.media.length} photo
            {post.media.length === 1 ? "" : "s"}
          </span>
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
  priority,
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
  // True only for the first post in whatever list is rendering this card
  // (every caller passes index === 0) — see PostMediaGrid's own comment for
  // why that one image needs it and every other one must not have it.
  priority?: boolean;
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
    <div id={`post-${post.id}`} className="postCard" data-nav-item>
      {isPureRepost && (
        <p className="mutedText row-sm" style={{ fontSize: "0.85rem" }}>
          <Repeat2 size={14} aria-hidden="true" /> {post.author.profile?.displayName ?? "Someone"} reposted
        </p>
      )}

      {isPinned && (
        <p className="mutedText row-sm" style={{ fontSize: "0.85rem" }}>
          <Pin size={14} aria-hidden="true" /> Pinned
        </p>
      )}

      {!isPureRepost && (
        <>
          <div className="postHeaderRow">
            <PostAvatar post={post} size={40} />
            <div className="postHeaderMain">
              <AuthorLine author={post.author} createdAt={post.createdAt} community={post.community} businessAuthor={post.businessAuthor} />
              {post.flair && <FlairPill flair={post.flair} />}
              {post.postType === "question" && (
                <span
                  className="mutedText"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginInlineStart: "0.4rem", fontSize: "0.8rem" }}
                >
                  <CircleHelp size={14} aria-hidden="true" /> Question
                </span>
              )}
              {post.requiredTier && (
                <span
                  className="mutedText"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginInlineStart: "0.4rem", fontSize: "0.8rem" }}
                >
                  <Lock size={14} aria-hidden="true" /> {post.requiredTier.name} subscribers
                </span>
              )}
            </div>
            <span className="row-sm postHeaderActions">
              {canModerate && (
                <form action={isPinned ? unpinPost : pinPost}>
                  <input type="hidden" name="communityId" value={post.communityId ?? ""} />
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    className="button buttonSecondary iconButton"
                    aria-label={isPinned ? "Unpin post" : "Pin post"}
                  >
                    <Pin size={16} aria-hidden="true" />
                  </button>
                </form>
              )}
              {isOwner && <PostOwnerMenu postId={post.id} body={post.body} />}
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
                    <ShieldX size={16} aria-hidden="true" />
                  </button>
                </form>
              )}
              {/* phase-12 spec §4.1: the generic report action, available on
                  any post the viewer doesn't own — same reusable
                  ReportButton every other subjectType renders. */}
              {currentUserId && !isOwner && <ReportButton subjectType="post" subjectId={post.id} />}
            </span>
          </div>
          <PostBody body={post.body} />
          <PostMediaGrid media={post.media} authorName={post.author.profile?.displayName ?? "Unknown"} priority={priority} />
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
        <div className="postActionsRow">
          <LikeButton postId={post.id} liked={isLiked} count={post.likeCount} />

          <details className="postActionToggle">
            <summary className="postAction" data-nav-reply>
              <MessageCircle size={16} aria-hidden="true" />
              {post.replyCount > 0 ? formatCount(post.replyCount) : "Reply"}
            </summary>
            <ReplyForm replyToId={post.id} />
            {post.replies.length > 0 && (() => {
              // A Q&A's accepted answer can land anywhere by createdAt order
              // — bubble it into the visible preview rather than letting it
              // hide behind "View all replies" (it's the one reply this
              // thread is meant to surface).
              const acceptedIndex = post.acceptedAnswerId
                ? post.replies.findIndex((r) => r.id === post.acceptedAnswerId)
                : -1;
              const orderedReplies =
                acceptedIndex >= INLINE_REPLY_PREVIEW_COUNT
                  ? [post.replies[acceptedIndex], ...post.replies.filter((_, i) => i !== acceptedIndex)]
                  : post.replies;
              const previewReplies = orderedReplies.slice(0, INLINE_REPLY_PREVIEW_COUNT);
              const restReplies = orderedReplies.slice(INLINE_REPLY_PREVIEW_COUNT);

              return (
                <div className="stack" style={{ marginTop: "0.6rem" }}>
                  {previewReplies.map((reply) => (
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
                  {restReplies.length > 0 && (
                    <details className="profileEditToggle">
                      <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                        View all {formatCount(post.replies.length)} replies
                      </summary>
                      <div className="stack" style={{ marginTop: "0.6rem" }}>
                        {restReplies.map((reply) => (
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
                    </details>
                  )}
                </div>
              );
            })()}
          </details>

          <form action={toggleRepost}>
            <input type="hidden" name="postId" value={post.id} />
            <button type="submit" className="postAction" aria-label="Repost">
              <Repeat2 size={16} aria-hidden="true" />
              {post.repostCount > 0 ? formatCount(post.repostCount) : "Repost"}
            </button>
          </form>

          <details className="postActionToggle">
            <summary className="postAction">
              <Quote size={16} aria-hidden="true" />
              Quote
            </summary>
            <QuoteRepostForm
              postId={post.id}
              authorName={post.author.profile?.displayName ?? "Unknown"}
              bodyPreview={post.body.slice(0, 80)}
            />
          </details>

          <form action={toggleBookmark} className="postActionEnd">
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              className="postAction"
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <Bookmark size={16} aria-hidden="true" fill={isBookmarked ? "currentColor" : "none"} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
