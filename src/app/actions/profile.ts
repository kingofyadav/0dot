"use server";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isValidThemePreset, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/theme-presets";
import type { ActionState } from "@/app/actions/auth";

function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    // Allowlist http/https only, rather than trying to blocklist every
    // dangerous scheme (javascript:, data:, etc.) — an allowlist can't be
    // bypassed by a scheme we forgot to blocklist.
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function saveUploadedImage(file: File): Promise<{ url: string } | { error: string }> {
  const ext = ALLOWED_IMAGE_EXTENSIONS[file.type];
  if (!ext) {
    return { error: "Images must be PNG, JPEG, WEBP, or GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Images must be 5MB or smaller." };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, filename), buffer);

  return { url: `/uploads/${filename}` };
}

async function requireOwnProfile() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile) redirect("/claim-username");
  return user;
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

  const data: {
    displayName: string;
    bio: string;
    themePreset: string;
    avatarUrl?: string;
    coverUrl?: string;
  } = {
    displayName,
    bio,
    themePreset: isValidThemePreset(themePresetRaw) ? themePresetRaw : "default",
  };

  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const result = await saveUploadedImage(avatarFile);
    if ("error" in result) return { error: result.error };
    data.avatarUrl = result.url;
  }

  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    data.coverUrl = result.url;
  }

  await db.profile.update({
    where: { userId: user.id },
    data,
  });

  revalidatePath(`/${user.username!.handle}`);
  redirect(`/${user.username!.handle}`);
}

export async function createLink(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireOwnProfile();

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
  if (linkCount >= 100) {
    return { error: "You've reached the 100-link limit." };
  }

  await db.link.create({
    data: {
      profileId: user.profile!.id,
      label,
      url,
      position: linkCount,
    },
  });

  revalidatePath(`/${user.username!.handle}`);
  return undefined;
}

export async function deleteLink(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const linkId = String(formData.get("linkId") ?? "");

  await db.link.deleteMany({
    where: { id: linkId, profileId: user.profile!.id },
  });

  revalidatePath(`/${user.username!.handle}`);
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

  revalidatePath(`/${user.username!.handle}`);
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

  revalidatePath(`/${user.username!.handle}`);
  return undefined;
}

export async function deleteSocialLink(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const socialLinkId = String(formData.get("socialLinkId") ?? "");

  await db.socialLink.deleteMany({
    where: { id: socialLinkId, profileId: user.profile!.id },
  });

  revalidatePath(`/${user.username!.handle}`);
}
