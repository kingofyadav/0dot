"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { isValidThemePreset, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/theme-presets";
import { saveUploadedImage } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireOwnProfile } from "@/lib/auth-guards";
import { isSafeUrl } from "@/lib/url-safety";
import { isProfilePremium, linkCapFor } from "@/lib/platform-billing";
import { ALLOW_DMS_FROM_VALUES } from "@/lib/privacy";
import type { ActionState } from "@/app/actions/auth";

// Every mutation here affects both surfaces: the settings page itself
// (/s/{handle}) needs to show the edit that was just made, and the public
// profile (/{handle}) needs to reflect it too (e.g. a newly added link)
// without requiring a manual reload.
function revalidateProfilePaths(handle: string): void {
  revalidatePath(`/s/${handle}`);
  revalidatePath(`/${handle}`);
}

// Today, every signup creates a Username + Profile atomically (see
// src/app/actions/auth.ts), so a verified user without a profile can't
// actually happen yet — but requireOwnProfile() above has redirected to
// this flow since it was written, anticipating a future OAuth-only signup
// path (phase-1 spec §3.3) that authenticates a User before a handle is
// chosen. This makes that redirect target real instead of a 404.
export async function claimUsername(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile) redirect(`/${user.username!.handle}`);
  if (!user.emailVerifiedAt) redirect("/verify/sent");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const handle = String(formData.get("username") ?? "").trim().toLowerCase();

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "Name must be 1-50 characters." };
  }

  const usernameError = validateUsernameFormat(handle);
  if (usernameError === "invalid_format") {
    return {
      error: "Username must be 3-30 characters: letters, numbers, underscore only.",
    };
  }
  if (usernameError === "reserved") {
    return { error: "That username is reserved." };
  }

  const existingHandle = await db.username.findUnique({ where: { handle } });
  if (existingHandle) {
    return { error: "That username is already taken." };
  }

  try {
    await db.$transaction([
      db.username.create({ data: { handle, userId: user.id } }),
      db.profile.create({ data: { userId: user.id, displayName } }),
    ]);
  } catch (err) {
    // The findUnique check above is check-then-act, not atomic — two
    // concurrent claims for the same handle can both pass it before either
    // insert commits. Catch the resulting unique-constraint violation
    // rather than letting it surface as an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That username is already taken." };
    }
    throw err;
  }

  // Straight to settings, not the (still-empty) public profile — the
  // natural next step right after claiming a handle is filling in bio/links.
  redirect(`/s/${handle}`);
}

export async function updateProfile(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireOwnProfile();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const themePresetRaw = String(formData.get("themePreset") ?? "default");

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "Display name must be 1-50 characters." };
  }
  if (bio.length > 280) {
    return { error: "Bio must be 280 characters or fewer." };
  }

  const isPremium = await isProfilePremium(user.profile!.id);

  const data: {
    displayName: string;
    bio: string;
    themePreset: string;
    isPrivate: boolean;
    avatarUrl?: string;
    coverUrl?: string;
  } = {
    displayName,
    bio,
    // premium-profiles addendum §5's downgrade rule: a currently-applied
    // premium preset that lapsed stays applied — re-submitting the
    // unchanged form (e.g. editing just the display name) must not reset
    // it, so resubmitting the profile's own current value is always
    // allowed regardless of premium status; only switching to a
    // *different* premium-only preset while not premium falls back.
    themePreset:
      themePresetRaw === user.profile!.themePreset || isValidThemePreset(themePresetRaw, isPremium)
        ? themePresetRaw
        : "default",
    isPrivate: formData.get("isPrivate") === "on",
  };

  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const result = await saveUploadedImage(avatarFile, { uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    data.avatarUrl = result.url;
  }

  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile, { uploadedById: user.id });
    if ("error" in result) return { error: result.error };
    data.coverUrl = result.url;
  }

  await db.profile.update({
    where: { userId: user.id },
    data,
  });

  revalidateProfilePaths(user.username!.handle);
  redirect(`/s/${user.username!.handle}`);
}

export async function createLink(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireOwnProfile();

  // Higher budget than post creation — someone setting up a fresh profile
  // legitimately adds a burst of links in one sitting. Still bounded to
  // stop scripted abuse of the link cap check below — see phase-1 spec
  // §7.2.
  if (!checkRateLimit(`link:create:user:${user.id}`, { max: 20, windowMs: 10 * 60 * 1000 })) {
    return { error: "You're adding links too fast. Please slow down." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();

  if (label.length < 1 || label.length > 80) {
    return { error: "Label must be 1-80 characters." };
  }
  if (!isSafeUrl(url)) {
    return { error: "Enter a valid http:// or https:// URL." };
  }

  const linkCount = await db.link.count({
    where: { profileId: user.profile!.id },
  });
  // premium-profiles addendum §3.4: raised, not removed, for an active
  // profile_premium subscriber — see linkCapFor (platform-billing.ts).
  const cap = await linkCapFor(user.profile!.id);
  if (linkCount >= cap) {
    return { error: `You've reached the ${cap}-link limit.` };
  }

  await db.link.create({
    data: {
      profileId: user.profile!.id,
      label,
      url,
      position: linkCount,
    },
  });

  revalidateProfilePaths(user.username!.handle);
  return undefined;
}

export async function deleteLink(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const linkId = String(formData.get("linkId") ?? "");

  await db.link.deleteMany({
    where: { id: linkId, profileId: user.profile!.id },
  });

  revalidateProfilePaths(user.username!.handle);
}

export async function moveLink(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const linkId = String(formData.get("linkId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const links = await db.link.findMany({
    where: { profileId: user.profile!.id },
    orderBy: { position: "asc" },
  });

  const index = links.findIndex((l) => l.id === linkId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= links.length) return;

  const current = links[index];
  const swapWith = links[swapIndex];

  await db.$transaction([
    db.link.update({
      where: { id: current.id },
      data: { position: swapWith.position },
    }),
    db.link.update({
      where: { id: swapWith.id },
      data: { position: current.position },
    }),
  ]);

  revalidateProfilePaths(user.username!.handle);
}

const MAX_FEATURED_LINKS = 3;

export async function toggleFeatured(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const linkId = String(formData.get("linkId") ?? "");

  const link = await db.link.findFirst({
    where: { id: linkId, profileId: user.profile!.id },
  });
  if (!link) return;

  if (!link.isFeatured) {
    // Cap enforced server-side (phase-1 spec §4.2). No error-surfacing UI
    // exists for this void action (mirrors moveLink's quiet no-op on an
    // invalid move) — turning on a 4th featured link is silently ignored
    // rather than introducing a one-off error path just for this control.
    const featuredCount = await db.link.count({
      where: { profileId: user.profile!.id, isFeatured: true },
    });
    if (featuredCount >= MAX_FEATURED_LINKS) return;
  }

  await db.link.update({
    where: { id: linkId },
    data: { isFeatured: !link.isFeatured },
  });

  revalidateProfilePaths(user.username!.handle);
}

export async function addSocialLink(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireOwnProfile();

  const platform = String(formData.get("platform") ?? "");
  const url = String(formData.get("url") ?? "").trim();

  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { error: "Choose a valid platform." };
  }
  if (!isSafeUrl(url)) {
    return { error: "Enter a valid http:// or https:// URL." };
  }

  const count = await db.socialLink.count({ where: { profileId: user.profile!.id } });
  if (count >= 10) {
    return { error: "You've reached the 10 social link limit." };
  }

  await db.socialLink.create({
    data: { profileId: user.profile!.id, platform, url, position: count },
  });

  revalidateProfilePaths(user.username!.handle);
  return undefined;
}

export async function deleteSocialLink(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const socialLinkId = String(formData.get("socialLinkId") ?? "");

  await db.socialLink.deleteMany({
    where: { id: socialLinkId, profileId: user.profile!.id },
  });

  revalidateProfilePaths(user.username!.handle);
}

// addendum §9: three controls backed by Profile.allowDmsFrom/allowTagging/
// discoverableInSearch. Enforcement at each field's call site (DM-send,
// tag-on-post, search/explore) is deliberately out of scope for this pass —
// see addendum §1 — this only persists the choice.
export async function updatePrivacySettings(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const allowDmsFrom = String(formData.get("allowDmsFrom") ?? "everyone");
  if (!ALLOW_DMS_FROM_VALUES.has(allowDmsFrom)) {
    return { error: "Choose a valid option for who can message you." };
  }

  await db.profile.update({
    where: { id: user.profile!.id },
    data: {
      allowDmsFrom,
      allowTagging: formData.get("allowTagging") === "on",
      discoverableInSearch: formData.get("discoverableInSearch") === "on",
    },
  });

  revalidateProfilePaths(user.username!.handle);
  return { success: true };
}
