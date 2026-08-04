"use client";

import { useState, useTransition } from "react";
import { requestEpisodeAudioUrl, issuePrivateFeedUrl } from "@/app/actions/podcasts";

export type EpisodeData = {
  id: string;
  title: string;
  description: string;
  requiredTierId: string | null;
  requiredTierName?: string;
};

// spec §9: ungated episodes play with no extra round trip (the audio route
// itself needs no token); a gated episode fetches a short-lived,
// access-checked download URL first, same "request a URL, then navigate"
// shape DigitalProductCard already established for purchased downloads.
export function PodcastEpisodesList({
  podcastId,
  rssSlug,
  episodes,
  isSignedIn,
}: {
  podcastId: string;
  rssSlug: string;
  episodes: EpisodeData[];
  isSignedIn: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePlay(episode: EpisodeData) {
    if (!episode.requiredTierId) {
      window.open(`/api/podcasts/episodes/${episode.id}/audio`, "_blank");
      return;
    }
    setErrors((prev) => ({ ...prev, [episode.id]: "" }));
    startTransition(async () => {
      const result = await requestEpisodeAudioUrl(episode.id);
      if ("error" in result) setErrors((prev) => ({ ...prev, [episode.id]: result.error }));
      else window.open(result.url, "_blank");
    });
  }

  function handleGetFeedLink() {
    startTransition(async () => {
      const result = await issuePrivateFeedUrl(podcastId);
      if (!("error" in result)) setFeedUrl(result.url);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {episodes.map((ep) => (
        <div key={ep.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.9rem" }}>
              {ep.title}
              {ep.requiredTierId && <span className="mutedText"> ({ep.requiredTierName ?? "members"} only)</span>}
            </span>
            <button type="button" className="button buttonSecondary buttonSmall" onClick={() => handlePlay(ep)} disabled={isPending}>
              Play
            </button>
          </div>
          {errors[ep.id] && <p className="errorText" style={{ margin: "0.2rem 0" }}>{errors[ep.id]}</p>}
        </div>
      ))}

      <div style={{ marginTop: "0.5rem" }}>
        <a href={`/podcast/${rssSlug}/rss.xml`} target="_blank" rel="noopener noreferrer" className="mutedText" style={{ fontSize: "0.8rem" }}>
          Public RSS feed
        </a>
        {isSignedIn && (
          <div style={{ marginTop: "0.35rem" }}>
            <button type="button" className="button buttonSecondary buttonSmall" onClick={handleGetFeedLink} disabled={isPending}>
              Get my private feed link
            </button>
            {feedUrl && (
              <p className="mutedText" style={{ fontSize: "0.75rem", marginTop: "0.3rem", wordBreak: "break-all" }}>
                {feedUrl} — includes member-only episodes you have access to. Don&apos;t share this link publicly.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
