"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { isSafeUrl } from "@/lib/url-safety";
import type { ActionState } from "@/app/actions/auth";

const PROVIDER_VALUES = new Set(["github", "gitlab", "bitbucket", "other"]);
const PROVIDER_HOSTS: Record<string, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

// spec §5.1/§5.3: public repository URLs only. For the three known
// providers the hostname must actually match — a "github" repo pointing at
// an arbitrary URL would otherwise get fed to the GitHub API by
// portfolio-sync.ts's fetchRepositoryMetadata for a repo it doesn't own.
function validateRepositoryUrl(url: string, provider: string): boolean {
  if (!isSafeUrl(url)) return false;
  const expectedHost = PROVIDER_HOSTS[provider];
  if (!expectedHost) return true; // "other" — any http(s) URL is fine
  try {
    return new URL(url).hostname.replace(/^www\./, "") === expectedHost;
  } catch {
    return false;
  }
}

export async function addGitRepository(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const provider = String(formData.get("provider") ?? "");
  if (!PROVIDER_VALUES.has(provider)) return { error: "Choose a provider." };

  const url = String(formData.get("url") ?? "").trim();
  if (!validateRepositoryUrl(url, provider)) {
    return { error: `That doesn't look like a valid ${provider === "other" ? "" : provider + " "}repository URL.` };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length < 1 || displayName.length > 100) return { error: "Name must be 1-100 characters." };

  const description = String(formData.get("description") ?? "").trim() || null;

  const projectIdRaw = String(formData.get("projectId") ?? "").trim() || null;
  let projectId: string | null = null;
  if (projectIdRaw) {
    const project = await db.project.findUnique({ where: { id: projectIdRaw }, select: { ownerId: true } });
    if (!project || project.ownerId !== user.id) return { error: "Choose one of your own projects." };
    projectId = projectIdRaw;
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  await db.gitRepository.create({
    data: { profileId: profile.id, projectId, provider, url, displayName, description },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
  return undefined;
}

export async function deleteGitRepository(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("gitRepositoryId") ?? "");
  if (!id) return;

  const repo = await db.gitRepository.findUnique({ where: { id }, include: { profile: true } });
  if (!repo || repo.profile.userId !== user.id) return;

  await db.gitRepository.delete({ where: { id } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
}
