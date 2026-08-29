import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Radio, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLivestream } from "@/app/actions/livestreams";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { LivestreamForm } from "../../LivestreamForm";

export const metadata: Metadata = { title: "Livestreams" };

export default async function LivestreamsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.username) redirect("/login");

  const [livestreams, myTiers] = await Promise.all([
    db.livestream.findMany({ where: { creatorId: currentUser.id }, orderBy: { createdAt: "desc" } }),
    db.membershipTier.findMany({ where: { creatorId: currentUser.id, status: "active" }, orderBy: { level: "asc" } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Livestreams</h2>
      {livestreams.length === 0 && <EmptyState message="No livestreams yet." />}
      {livestreams.length > 0 && (
        <div className="settingsGroup">
          {livestreams.map((live) => (
            <SettingsRow
              key={live.id}
              icon={Radio}
              label={live.title}
              description={`${live.status}${live.scheduledAt ? ` · ${live.scheduledAt.toLocaleString()}` : ""}${live.requiredTierId ? " · member-only" : ""}`}
              trailing={
                <>
                  <Link href={`/live/${live.id}`} className="button buttonSecondary buttonSmall">Manage</Link>
                  {live.status !== "live" && (
                    <form action={deleteLivestream}>
                      <input type="hidden" name="livestreamId" value={live.id} />
                      <ConfirmButton
                        className="button buttonSecondary iconButton"
                        aria-label="Delete livestream"
                        title="Delete this livestream?"
                        description="Chat history for this livestream will be deleted too. This can't be undone."
                        confirmLabel="Delete"
                      >
                        ×
                      </ConfirmButton>
                    </form>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup" style={{ marginTop: "var(--space-3)" }}>
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Schedule a livestream</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <LivestreamForm ownTiers={myTiers} />
        </div>
      </details>
    </div>
  );
}
