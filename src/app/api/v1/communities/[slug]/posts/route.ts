import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCommunityMember, resolvePostCommunityContext } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { getCommunityFeedPosts } from "@/lib/community-feed";
import { notifyMentionsInBody } from "@/lib/notifications";
import { checkDuplicatePostPattern } from "@/lib/account-risk";
import { parseCursor } from "@/lib/pagination";
import { revalidatePath } from "next/cache";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const community = await db.community.findUnique({ where: { slug } });
  if (!community) return apiError("Not found.", 404);

  const membership = await getCommunityMember(community.id, ctx.userId);
  if (isGatedFromCommunityContent(community, membership?.status === "active")) {
    return apiError("Join this community to view its posts.", 403);
  }

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const { pinned, items, nextCursor } = await getCommunityFeedPosts({ communityId: community.id, cursor, viewerId: ctx.userId });
  const allPosts = [...pinned, ...items];

  const postIds = allPosts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds] = await Promise.all([
    db.postLike.findMany({ where: { userId: ctx.userId, postId: { in: postIds } }, select: { postId: true } }).then((r) => new Set(r.map((x) => x.postId))),
    db.bookmark.findMany({ where: { userId: ctx.userId, postId: { in: postIds } }, select: { postId: true } }).then((r) => new Set(r.map((x) => x.postId))),
  ]);

  return Response.json(
    {
      items: allPosts.map((post) => ({
        id: post.id,
        body: post.body,
        author: post.author.username?.handle ?? null,
        authorDisplayName: post.author.profile?.displayName ?? null,
        authorAvatarUrl: post.author.profile?.avatarUrl ?? null,
        authorVerified: post.author.profile?.isVerified ?? false,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        repostCount: post.repostCount,
        isLiked: likedPostIds.has(post.id),
        isBookmarked: bookmarkedPostIds.has(post.id),
        media: post.media.map((m) => ({ url: m.url, position: m.position })),
        createdAt: post.createdAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Text-only for this first cut (no media upload) — same scoping decision
// as POST /api/v1/conversations/[id]/messages. Requires posts:write, not a
// communities-specific write scope: this creates a real row in the same
// Post table every other post lives in, the identical consent-screen
// meaning that scope already covers (see oauth.ts's own comment on
// communities:write vs. posts:write for why membership actions and content
// creation stay on different scopes).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const community = await db.community.findUnique({ where: { slug }, select: { id: true } });
  if (!community) return apiError("Not found.", 404);

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const flairId = typeof payload?.flairId === "string" ? payload.flairId : null;
  if (body.length < 1) return apiError("Post can't be empty.", 400);
  if (body.length > 500) return apiError("Posts are limited to 500 characters.", 400);

  const context = await resolvePostCommunityContext(ctx.userId, community.id, flairId);
  if (context && "error" in context) return apiError(context.error, 403);
  if (!context) return apiError("Community not found.", 404);

  if (!checkRateLimit(`post:create:user:${ctx.userId}`, { max: 10, windowMs: 5 * 60 * 1000 })) {
    return apiError("You're posting too fast. Please slow down.", 429);
  }

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { username: { select: { handle: true } }, profile: { select: { displayName: true, avatarUrl: true, isVerified: true } } },
  });

  const newPost = await db.post.create({
    data: { authorId: ctx.userId, body, communityId: context.communityId, flairId: context.flairId },
    select: { id: true, createdAt: true },
  });

  await notifyMentionsInBody(body, ctx.userId, newPost.id);
  await checkDuplicatePostPattern(ctx.userId, body);

  revalidatePath(`/c/${context.communitySlug}`);

  return Response.json(
    {
      id: newPost.id,
      body,
      author: user?.username?.handle ?? null,
      authorDisplayName: user?.profile?.displayName ?? null,
      authorAvatarUrl: user?.profile?.avatarUrl ?? null,
      authorVerified: user?.profile?.isVerified ?? false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      isLiked: false,
      isBookmarked: false,
      media: [],
      createdAt: newPost.createdAt,
    },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
