import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { isValidThemePreset } from "@/lib/theme-presets";
import { isProfilePremium } from "@/lib/platform-billing";
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

  const isPremium = user.profile ? await isProfilePremium(user.profile.id) : false;

  return Response.json(
    {
      id: user.id,
      username: user.username?.handle ?? null,
      displayName: user.profile?.displayName ?? null,
      bio: user.profile?.bio ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      coverUrl: user.profile?.coverUrl ?? null,
      themePreset: user.profile?.themePreset ?? null,
      isPrivate: user.profile?.isPrivate ?? false,
      isPremium,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

// Mobile Phase C (rich profile edit) originally had no isPrivate/themePreset
// here — neither was part of what the mobile edit screen asked for at the
// time. M12 (settings/account parity) adds both, closing that gap the same
// way M9's profile pass closed followingCount/isPremium on the read side.
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
  let isPrivate: boolean | undefined;
  let themePreset: string | undefined;
  let avatarFile: File | null = null;
  let coverFile: File | null = null;

  if (isMultipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Invalid form data.", 400);
    if (form.has("displayName")) displayName = String(form.get("displayName") ?? "").trim();
    if (form.has("bio")) bio = String(form.get("bio") ?? "").trim();
    if (form.has("isPrivate")) isPrivate = String(form.get("isPrivate")) === "true";
    if (form.has("themePreset")) themePreset = String(form.get("themePreset"));
    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) avatarFile = avatar;
    const cover = form.get("cover");
    if (cover instanceof File && cover.size > 0) coverFile = cover;
  } else {
    const payload = await request.json().catch(() => null);
    if (typeof payload?.displayName === "string") displayName = payload.displayName.trim();
    if (typeof payload?.bio === "string") bio = payload.bio.trim();
    if (typeof payload?.isPrivate === "boolean") isPrivate = payload.isPrivate;
    if (typeof payload?.themePreset === "string") themePreset = payload.themePreset;
  }

  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 50)) {
    return apiError("Display name must be 1-50 characters.", 400);
  }
  if (bio !== undefined && bio.length > 280) return apiError("Bio must be 280 characters or fewer.", 400);
  if (themePreset !== undefined) {
    const isPremium = await isProfilePremium(existing.profile.id);
    if (!isValidThemePreset(themePreset, isPremium)) {
      return apiError("That theme isn't available on your plan.", 400);
    }
  }

  const data: { displayName?: string; bio?: string; avatarUrl?: string; coverUrl?: string; isPrivate?: boolean; themePreset?: string } = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (bio !== undefined) data.bio = bio;
  if (isPrivate !== undefined) data.isPrivate = isPrivate;
  if (themePreset !== undefined) data.themePreset = themePreset;
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
      themePreset: profile.themePreset,
      isPrivate: profile.isPrivate,
      isVerified: profile.isVerified,
      followerCount: profile.followerCount,
      isOwnProfile: true,
      followStatus: null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
