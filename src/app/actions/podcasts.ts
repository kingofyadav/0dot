"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveProtectedFile, issueDownloadToken } from "@/lib/protected-storage";
import { getCurrentUser } from "@/lib/session";
import { hasTierAccess } from "@/lib/tier-access";
import { generateFeedToken } from "@/lib/podcasts";
import type { ActionState } from "@/app/actions/auth";

const MAX_AUDIO_BYTES = 300 * 1024 * 1024;

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "podcast"
  );
}

// spec §9: one podcast per creator's show; rssSlug is derived from the
// title with a random suffix for uniqueness, not user-editable — same
// "server derives the identifier, never trusts client input for it"
// posture as everywhere else in this codebase a slug backs a public URL.
export async function createPodcast(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const rssSlug = `${slugify(title)}-${randomBytes(4).toString("hex")}`;

  await db.podcast.create({ data: { creatorId: user.id, title, description, rssSlug } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function updatePodcast(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const podcastId = String(formData.get("podcastId") ?? "");

  const podcast = await db.podcast.findUnique({ where: { id: podcastId } });
  if (!podcast || podcast.creatorId !== user.id) return { error: "You don't have permission to manage this podcast." };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  await db.podcast.update({ where: { id: podcast.id }, data: { title, description } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

async function requireOwnedPodcast(podcastId: string, userId: string) {
  const podcast = await db.podcast.findUnique({ where: { id: podcastId } });
  if (!podcast || podcast.creatorId !== userId) return null;
  return podcast;
}

export async function createEpisode(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const podcastId = String(formData.get("podcastId") ?? "");

  const podcast = await requireOwnedPodcast(podcastId, user.id);
  if (!podcast) return { error: "You don't have permission to manage this podcast." };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const requiredTierIdRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
  let requiredTierId: string | null = null;
  if (requiredTierIdRaw) {
    const tier = await db.membershipTier.findUnique({ where: { id: requiredTierIdRaw }, select: { creatorId: true } });
    if (!tier || tier.creatorId !== user.id) return { error: "Choose one of your own membership tiers." };
    requiredTierId = requiredTierIdRaw;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an audio file for this episode." };
  const saved = await saveProtectedFile(file, { maxBytes: MAX_AUDIO_BYTES });
  if ("error" in saved) return saved;

  const durationS = Number(formData.get("durationS") ?? 0);

  const episodeCount = await db.podcastEpisode.count({ where: { podcastId } });
  await db.podcastEpisode.create({
    data: {
      podcastId,
      episodeNumber: episodeCount + 1,
      title,
      description,
      requiredTierId,
      fileKey: saved.key,
      fileMimeType: saved.mimeType,
      fileSizeBytes: saved.sizeBytes,
      durationS: Number.isFinite(durationS) && durationS > 0 ? Math.floor(durationS) : 0,
    },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function deleteEpisode(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const episodeId = String(formData.get("episodeId") ?? "");
  if (!episodeId) return;

  const episode = await db.podcastEpisode.findUnique({ where: { id: episodeId }, include: { podcast: true } });
  if (!episode || episode.podcast.creatorId !== user.id) return;

  await db.podcastEpisode.delete({ where: { id: episodeId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §9.2: issues a fresh private-feed token for the caller. Calling
// again for a podcast the caller already has a live token for reuses it
// (no unbounded token accumulation from repeat clicks) rather than
// creating a new row every time.
export async function issuePrivateFeedUrl(podcastId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireVerifiedUser();

  const podcast = await db.podcast.findUnique({ where: { id: podcastId } });
  if (!podcast) return { error: "Podcast not found." };

  let feedToken = await db.podcastFeedToken.findFirst({
    where: { podcastId, subscriberId: user.id, revokedAt: null },
  });
  if (!feedToken) {
    feedToken = await db.podcastFeedToken.create({
      data: { podcastId, subscriberId: user.id, token: generateFeedToken() },
    });
  }

  return { url: `/podcast/${podcast.rssSlug}/rss.xml?t=${feedToken.token}` };
}

// spec §9's web-playback path (as opposed to an RSS app's feed-token
// path, /api/podcasts/episodes/[id]/audio): an ungated episode needs no
// token at all (that route already serves it with no auth), so this is
// only ever called for a gated episode a signed-in listener currently
// qualifies for — re-checked live, same hasTierAccess gate every other
// surface in this phase uses.
export async function requestEpisodeAudioUrl(episodeId: string): Promise<{ url: string } | { error: string }> {
  const episode = await db.podcastEpisode.findUnique({ where: { id: episodeId }, include: { podcast: true } });
  if (!episode) return { error: "Episode not found." };
  if (!episode.requiredTierId) return { url: `/api/podcasts/episodes/${episode.id}/audio` };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play this episode." };
  if (!(await hasTierAccess(user.id, episode.podcast.creatorId, episode.requiredTierId))) {
    return { error: "You don't have access to this episode." };
  }

  const token = issueDownloadToken({ resourceType: "podcast_episode", resourceId: episode.id, userId: user.id });
  return { url: `/api/downloads/${token}` };
}

// spec §9.2's third criterion: revoking invalidates that URL immediately —
// resolvePodcastFeedToken (src/lib/podcasts.ts) checks revokedAt on every
// fetch, so this takes effect on the very next poll, not eventually.
export async function revokePrivateFeedUrl(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const podcastId = String(formData.get("podcastId") ?? "");
  if (!podcastId) return;

  await db.podcastFeedToken.updateMany({
    where: { podcastId, subscriberId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (user.username) revalidatePath(`/${user.username.handle}`);
}
