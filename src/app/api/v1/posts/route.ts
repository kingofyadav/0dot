import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyReply, notifyMentionsInBody } from "@/lib/notifications";
import { checkDuplicatePostPattern } from "@/lib/account-risk";
import { saveUploadedImage } from "@/lib/uploads";
import { revalidatePath } from "next/cache";

const RATE_LIMIT_ERROR = "You're posting too fast. Please slow down.";
// Mirrors createPost's own constants (actions/posts.ts) — duplicated
// rather than imported for the same "use server" boundary reason the
// module comment below explains for checkPostRateLimit's key.
const MAX_MEDIA_PER_POST = 4;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

// Compose + reply for first-party mobile clients (Phase B: text; Phase C:
// image media). No community/business/tier context or poll/question post
// types — those stay web-only until a mobile compose screen actually needs
// them. Shares the same per-user rate-limit key as createPost
// (`post:create:user:${userId}`) rather than a separate budget, so a
// single logical "how many posts can this account create per window"
// limit holds regardless of which client is used — this can't import
// createPost's own checkPostRateLimit directly since posts.ts is a
// "use server" file (any plain export from it becomes a client-invokable
// action), so the key is duplicated here the same way polls.ts already
// does for the same reason.
//
// Accepts both JSON (text-only, Phase B's original shape) and
// multipart/form-data (adds `media` file fields) on the same route rather
// than a second endpoint — branching on Content-Type is the standard way
// a Route Handler tells the two apart, and every other concern (auth,
// rate limit, reply/top-level branching) is identical either way.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "posts:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: {
      emailVerifiedAt: true,
      username: { select: { handle: true } },
      profile: { select: { displayName: true, avatarUrl: true, isVerified: true } },
    },
  });
  if (!user?.emailVerifiedAt) return apiError("Your account must have a verified email to post.", 403);

  const isMultipart = (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  let body: string;
  let replyToId: string | null;
  let mediaFiles: File[] = [];

  if (isMultipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Invalid form data.", 400);
    body = String(form.get("body") ?? "").trim();
    replyToId = String(form.get("replyToId") ?? "").trim() || null;
    mediaFiles = form.getAll("media").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  } else {
    const payload = await request.json().catch(() => null);
    body = String(payload?.body ?? "").trim();
    replyToId = typeof payload?.replyToId === "string" && payload.replyToId.trim() ? payload.replyToId.trim() : null;
  }

  if (mediaFiles.length > MAX_MEDIA_PER_POST) return apiError(`You can attach up to ${MAX_MEDIA_PER_POST} images.`, 400);
  // 0-length body is only allowed when media makes up for it (spec §5.2,
  // same rule createPost enforces).
  if (body.length < 1 && mediaFiles.length === 0) return apiError("Post can't be empty.", 400);
  if (body.length > 500) return apiError("Posts are limited to 500 characters.", 400);

  if (!checkRateLimit(`post:create:user:${ctx.userId}`, { max: 10, windowMs: 5 * 60 * 1000 })) {
    return apiError(RATE_LIMIT_ERROR, 429);
  }

  const mediaCreates: { url: string; position: number }[] = [];
  for (const [index, file] of mediaFiles.entries()) {
    const result = await saveUploadedImage(file, { maxBytes: MAX_MEDIA_BYTES, uploadedById: ctx.userId });
    if ("error" in result) return apiError(result.error, 400);
    mediaCreates.push({ url: result.url, position: index });
  }

  let newPost: { id: string; createdAt: Date };
  if (replyToId) {
    const parent = await db.post.findFirst({ where: { id: replyToId, deletedAt: null } });
    if (!parent) return apiError("The post you're replying to is no longer available.", 404);

    const [created] = await db.$transaction([
      db.post.create({
        data: { authorId: ctx.userId, body, replyToId, media: { create: mediaCreates } },
        select: { id: true, createdAt: true },
      }),
      db.post.update({ where: { id: replyToId }, data: { replyCount: { increment: 1 } } }),
    ]);
    newPost = created;
    await notifyReply({ recipientId: parent.authorId, actorId: ctx.userId, subjectId: replyToId });
  } else {
    newPost = await db.post.create({
      data: { authorId: ctx.userId, body, media: { create: mediaCreates } },
      select: { id: true, createdAt: true },
    });
  }

  await notifyMentionsInBody(body, ctx.userId, newPost.id);
  await checkDuplicatePostPattern(ctx.userId, body);

  revalidatePath("/feed");
  revalidatePath("/explore");
  if (user.username?.handle) revalidatePath(`/${user.username.handle}`);

  return Response.json(
    {
      id: newPost.id,
      body,
      author: user.username?.handle ?? null,
      authorDisplayName: user.profile?.displayName ?? null,
      authorAvatarUrl: user.profile?.avatarUrl ?? null,
      authorVerified: user.profile?.isVerified ?? false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      isLiked: false,
      isBookmarked: false,
      media: mediaCreates,
      createdAt: newPost.createdAt,
    },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
