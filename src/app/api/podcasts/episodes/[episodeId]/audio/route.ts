import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { streamProtectedFile } from "@/lib/protected-storage";
import { canAccessEpisode, resolvePodcastFeedToken } from "@/lib/podcasts";

// spec §9.3: ungated episodes stream with no auth at all (a podcast app has
// no session to check) — gated episodes require a valid, unrevoked, still-
// entitled PodcastFeedToken passed as ?t=, re-verified here at request
// time, same double-check posture /api/downloads/[token] already
// establishes for digital products and course lessons.
export async function GET(request: NextRequest, { params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;

  const episode = await db.podcastEpisode.findUnique({ where: { id: episodeId }, include: { podcast: true } });
  if (!episode) return new Response("Not found", { status: 404 });

  const rawToken = request.nextUrl.searchParams.get("t");
  const resolvedFeedToken = rawToken ? await resolvePodcastFeedToken(rawToken) : null;

  if (!(await canAccessEpisode(episode, episode.podcast.creatorId, resolvedFeedToken))) {
    return new Response("Not found", { status: 404 });
  }

  return streamProtectedFile(episode.fileKey, episode.fileMimeType, episode.title, request, "inline");
}
