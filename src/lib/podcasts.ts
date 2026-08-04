import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hasTierAccess } from "@/lib/tier-access";

// spec §9.2: a subscriber's private feed URL includes gated episodes they
// currently qualify for — re-checked per fetch (this function), never
// baked into the token once at issuance. Revoking the row (revokedAt) is
// what actually invalidates that specific URL; the token string itself has
// no expiry of its own.
export async function resolvePodcastFeedToken(
  token: string
): Promise<{ podcastId: string; subscriberId: string } | null> {
  const row = await db.podcastFeedToken.findUnique({ where: { token } });
  if (!row || row.revokedAt) return null;
  return { podcastId: row.podcastId, subscriberId: row.subscriberId };
}

// spec §9.3: an episode is playable/downloadable by a given (possibly
// anonymous) requester if it's ungated, or the requester holds a live
// feedToken scoped to this exact podcast whose subscriber currently has
// tier access — same hasTierAccess (src/lib/tier-access.ts) every other
// gated surface in this phase reuses, computed live rather than cached on
// the token.
export async function canAccessEpisode(
  episode: { podcastId: string; requiredTierId: string | null },
  podcastCreatorId: string,
  feedToken: { podcastId: string; subscriberId: string } | null
): Promise<boolean> {
  if (!episode.requiredTierId) return true;
  if (!feedToken || feedToken.podcastId !== episode.podcastId) return false;
  return hasTierAccess(feedToken.subscriberId, podcastCreatorId, episode.requiredTierId);
}

export function generateFeedToken(): string {
  return randomBytes(24).toString("hex");
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

// spec §9.3's literal criterion: the public feed never includes an episode
// with a non-null requiredTierId. A private feed (feedToken passed) also
// re-checks live access per episode via canAccessEpisode, so a lapsed
// subscription silently stops seeing new gated episodes on the next poll
// without needing a new token.
export async function buildPodcastRss(
  podcast: { id: string; title: string; description: string; coverUrl: string | null; rssSlug: string; creatorId: string },
  origin: string,
  rawToken: string | null,
  resolvedFeedToken: { podcastId: string; subscriberId: string } | null
): Promise<string> {
  const episodes = await db.podcastEpisode.findMany({
    where: { podcastId: podcast.id, publishAt: { lte: new Date() } },
    orderBy: { publishAt: "desc" },
  });

  const visibleEpisodes = [];
  for (const ep of episodes) {
    if (await canAccessEpisode(ep, podcast.creatorId, resolvedFeedToken)) visibleEpisodes.push(ep);
  }

  const tokenSuffix = rawToken ? `?t=${encodeURIComponent(rawToken)}` : "";
  const items = visibleEpisodes
    .map((ep) => {
      const audioUrl = `${origin}/api/podcasts/episodes/${ep.id}/audio${tokenSuffix}`;
      return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <enclosure url="${escapeXml(audioUrl)}" length="${ep.fileSizeBytes}" type="${escapeXml(ep.fileMimeType)}" />
      <guid>${escapeXml(ep.id)}</guid>
      <pubDate>${ep.publishAt.toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <description>${escapeXml(podcast.description)}</description>
    <link>${escapeXml(`${origin}/podcast/${podcast.rssSlug}${tokenSuffix}`)}</link>
    ${podcast.coverUrl ? `<image><url>${escapeXml(podcast.coverUrl)}</url></image>` : ""}
${items}
  </channel>
</rss>`;
}
