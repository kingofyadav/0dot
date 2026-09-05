import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPostById, getVotedPollOptionIds } from "@/lib/feed-query";
import { PostCard, MiniPostCard } from "@/components/PostCard";
import { SITE_DESCRIPTION } from "@/lib/site-metadata";

// Plain-text, meta-description-length excerpt — distinct from linkify.tsx's
// splitPostBody, which truncates for an in-page "Show more" disclosure (HTML
// output, longer limit, cuts precisely at MAX_MENTIONS_PER_POST-aware token
// boundaries this doesn't need to care about).
function excerptFor(body: string, max = 100): string {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length <= max) return trimmed;
  const cut = trimmed.lastIndexOf(" ", max);
  return `${trimmed.slice(0, cut > 0 ? cut : max)}…`;
}

async function loadPost(postId: string) {
  const currentUser = await getCurrentUser();
  const post = await getPostById(postId, currentUser?.id ?? null);
  return { post, currentUser };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  const { post } = await loadPost(postId);
  if (!post) return {};

  const displayName = post.businessAuthor?.name ?? post.author.profile?.displayName ?? "Unknown";
  const excerpt = excerptFor(post.body);
  const title = excerpt ? `${displayName}: "${excerpt}"` : `A post by ${displayName}`;
  const description = excerpt || SITE_DESCRIPTION;
  // First post image wins over the author's avatar — it's the actual
  // content being shared, same priority order PostMediaGrid's own LCP
  // image gets within the feed.
  const images = post.media[0]?.url ? [post.media[0].url] : post.author.profile?.avatarUrl ? [post.author.profile.avatarUrl] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images, type: "article" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

// Post permalink — SEO-plan Phase 1. Previously no single post had its own
// URL at all (see feed-query.ts's getPostById and notifications.ts's
// getNotificationHref, both updated alongside this file): a post was only
// ever reachable embedded in /feed or as an in-page anchor on the author's
// profile, invisible to search engines and unshareable on its own. v1 scope
// deliberately stops at "a real, indexable page exists" — the post's own
// content (via the same PostCard used everywhere else) plus, if it's a
// reply, its direct parent for basic context (MiniPostCard, the same
// flattened read-only treatment repostOf already gets). A full redesigned
// thread/conversation view is a separate project, not this one.
export default async function PostPermalinkPage({ params }: { params: Promise<{ username: string; postId: string }> }) {
  const { username: rawHandle, postId } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();

  const { post, currentUser } = await loadPost(postId);
  if (!post) notFound();
  // The username segment is cosmetic (postId alone is the real identifier)
  // but must match the post's actual author — otherwise this would serve
  // the same content at unbounded alternate URLs, exactly the duplicate-
  // content problem a permalink page exists to avoid.
  if (post.author.username?.handle !== handle) notFound();

  const isOwner = currentUser?.id === post.authorId;
  // getPostById's visibility conditions cover community/tier/block gating
  // but not private-account gating (see [username]/page.tsx's own
  // canViewFullProfile comment — isPrivate is checked at the page level,
  // not inside the shared post-visibility helper) — same check, same
  // "owner or accepted follower" rule, applied here too.
  if (post.author.profile?.isPrivate && !isOwner) {
    const followRow = currentUser
      ? await db.follow.findFirst({ where: { followerId: currentUser.id, followeeId: post.authorId }, select: { status: true } })
      : null;
    if (followRow?.status !== "accepted") notFound();
  }

  const [likeRow, bookmarkRow, votedOptionIds] = await Promise.all([
    currentUser ? db.postLike.findFirst({ where: { userId: currentUser.id, postId: post.id } }) : Promise.resolve(null),
    currentUser ? db.bookmark.findFirst({ where: { userId: currentUser.id, postId: post.id } }) : Promise.resolve(null),
    getVotedPollOptionIds(currentUser?.id, [post]),
  ]);

  return (
    <div className="itemStack">
      {post.replyTo &&
        (post.replyTo.deletedAt === null ? (
          <MiniPostCard post={post.replyTo} currentUserId={currentUser?.id} variant="reply" />
        ) : (
          <p className="mutedText">This post was deleted.</p>
        ))}
      <PostCard
        post={post}
        isLiked={Boolean(likeRow)}
        isBookmarked={Boolean(bookmarkRow)}
        isOwner={isOwner}
        currentUserId={currentUser?.id}
        votedOptionIds={votedOptionIds}
        priority
      />
    </div>
  );
}
