import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { revalidatePath } from "next/cache";

// Representative /v1 endpoint (phase-10 spec §5.1/§5.2): every route in
// this API resolves the bearer token via resolveApiRequest, checks the
// rate limit, then reads through the same tables/fields the web UI itself
// reads — no parallel serialization layer that could drift from what
// getCurrentUser()-backed pages already show a signed-in user about
// themselves.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    include: { username: true, profile: true },
  });
  if (!user) return apiError("Not found.", 404);

  return Response.json(
    {
      id: user.id,
      username: user.username?.handle ?? null,
      displayName: user.profile?.displayName ?? null,
      bio: user.profile?.bio ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      coverUrl: user.profile?.coverUrl ?? null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Mobile Phase C (rich profile edit). Deliberately narrower than
// updateProfile (actions/profile.ts): no isPrivate/themePreset here —
// neither was part of what the mobile edit screen actually asked for.
// Same dual JSON/multipart shape as POST /posts (avatar/cover need files;
// a text-only edit doesn't need to pay for a multipart request).
export async function PATCH(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const existing = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { username: { select: { handle: true } }, profile: { select: { id: true } } },
  });
  if (!existing?.profile) return apiError("Claim a username before editing your profile.", 400);

  const isMultipart = (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  let displayName: string | undefined;
  let bio: string | undefined;
  let avatarFile: File | null = null;
  let coverFile: File | null = null;

  if (isMultipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Invalid form data.", 400);
    if (form.has("displayName")) displayName = String(form.get("displayName") ?? "").trim();
    if (form.has("bio")) bio = String(form.get("bio") ?? "").trim();
    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) avatarFile = avatar;
    const cover = form.get("cover");
    if (cover instanceof File && cover.size > 0) coverFile = cover;
  } else {
    const payload = await request.json().catch(() => null);
    if (typeof payload?.displayName === "string") displayName = payload.displayName.trim();
    if (typeof payload?.bio === "string") bio = payload.bio.trim();
  }

  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 50)) {
    return apiError("Display name must be 1-50 characters.", 400);
  }
  if (bio !== undefined && bio.length > 280) return apiError("Bio must be 280 characters or fewer.", 400);

  const data: { displayName?: string; bio?: string; avatarUrl?: string; coverUrl?: string } = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (bio !== undefined) data.bio = bio;
  if (avatarFile) {
    const result = await saveUploadedImage(avatarFile, { uploadedById: ctx.userId });
    if ("error" in result) return apiError(result.error, 400);
    data.avatarUrl = result.url;
  }
  if (coverFile) {
    const result = await saveUploadedImage(coverFile, { uploadedById: ctx.userId });
    if ("error" in result) return apiError(result.error, 400);
    data.coverUrl = result.url;
  }

  const profile = await db.profile.update({ where: { userId: ctx.userId }, data });

  if (existing.username?.handle) revalidatePath(`/${existing.username.handle}`);
  revalidatePath("/feed");

  return Response.json(
    {
      username: existing.username?.handle ?? null,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      coverUrl: profile.coverUrl,
      isVerified: profile.isVerified,
      followerCount: profile.followerCount,
      isOwnProfile: true,
      followStatus: null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
