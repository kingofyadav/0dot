import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteEpisode } from "@/app/actions/podcasts";
import { PodcastForm } from "../../PodcastForm";
import { EpisodeForm } from "../../EpisodeForm";

export default async function PodcastSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.username) redirect("/login");

  const [podcast, myTiers] = await Promise.all([
    db.podcast.findFirst({
      where: { creatorId: currentUser.id },
      include: { episodes: { orderBy: { episodeNumber: "desc" } } },
    }),
    db.membershipTier.findMany({ where: { creatorId: currentUser.id, status: "active" }, orderBy: { level: "asc" } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Podcast</h2>
      {!podcast ? (
        <>
          <p className="mutedText">You haven&apos;t created a podcast yet.</p>
          <PodcastForm />
        </>
      ) : (
        <>
          <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <strong>{podcast.title}</strong>
            {podcast.description && <span className="mutedText">{podcast.description}</span>}
            <a href={`/podcast/${podcast.rssSlug}/rss.xml`} target="_blank" rel="noopener noreferrer" className="mutedText" style={{ fontSize: "0.8rem" }}>
              Public RSS feed
            </a>
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <PodcastForm podcast={podcast} />
              </div>
            </details>
          </div>

          <h3 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>Episodes</h3>
          {podcast.episodes.length === 0 && <p className="mutedText">No episodes yet.</p>}
          {podcast.episodes.map((episode) => (
            <div key={episode.id} className="profileLinkItem" style={{ marginBottom: "0.35rem" }}>
              <span>
                #{episode.episodeNumber} <strong>{episode.title}</strong>{" "}
                {episode.requiredTierId && <span className="mutedText">(member-only)</span>}
              </span>
              <form action={deleteEpisode}>
                <input type="hidden" name="episodeId" value={episode.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
              </form>
            </div>
          ))}
          <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
            <summary>Add an episode</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <EpisodeForm podcastId={podcast.id} ownTiers={myTiers} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
