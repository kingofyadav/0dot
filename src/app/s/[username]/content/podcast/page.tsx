import { redirect } from "next/navigation";
import { Mic, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteEpisode } from "@/app/actions/podcasts";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
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
          <p className="mutedText" style={{ marginBottom: "1rem" }}>You haven&apos;t created a podcast yet.</p>
          <PodcastForm />
        </>
      ) : (
        <>
          <div className="settingsGroup" style={{ marginBottom: "var(--space-6)" }}>
            <SettingsRow
              icon={Mic}
              label={podcast.title}
              description={podcast.description ?? undefined}
              trailing={
                <a href={`/podcast/${podcast.rssSlug}/rss.xml`} target="_blank" rel="noopener noreferrer" className="button buttonSecondary buttonSmall">
                  RSS feed
                </a>
              }
            />
            <details>
              <summary className="settingsRow settingsAddTrigger">
                <span className="settingsRowIcon" aria-hidden="true">
                  <Pencil size={16} />
                </span>
                <span className="settingsRowText">
                  <span className="settingsRowLabel">Edit details</span>
                </span>
              </summary>
              <div className="settingsAddPanelBody">
                <PodcastForm podcast={podcast} />
              </div>
            </details>
          </div>

          <p className="settingsGroupLabel">Episodes</p>
          {podcast.episodes.length === 0 ? (
            <EmptyState message="No episodes yet." />
          ) : (
            <div className="settingsGroup">
              {podcast.episodes.map((episode) => (
                <SettingsRow
                  key={episode.id}
                  icon={Mic}
                  label={`#${episode.episodeNumber} ${episode.title}`}
                  description={episode.requiredTierId ? "Member-only" : undefined}
                  trailing={
                    <form action={deleteEpisode}>
                      <input type="hidden" name="episodeId" value={episode.id} />
                      <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
                    </form>
                  }
                />
              ))}
            </div>
          )}
          <details className="settingsGroup">
            <summary className="settingsRow settingsAddTrigger">
              <span className="settingsRowIcon" aria-hidden="true">
                <Plus size={18} />
              </span>
              <span className="settingsRowText">
                <span className="settingsRowLabel">Add an episode</span>
              </span>
            </summary>
            <div className="settingsAddPanelBody">
              <EpisodeForm podcastId={podcast.id} ownTiers={myTiers} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
