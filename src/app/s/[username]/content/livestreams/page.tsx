import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { LivestreamForm } from "../../LivestreamForm";

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
      {livestreams.length === 0 && <p className="mutedText">No livestreams yet.</p>}
      {livestreams.map((live) => (
        <div key={live.id} className="profileLinkItem" style={{ marginBottom: "0.35rem" }}>
          <span>
            <strong>{live.title}</strong>{" "}
            <span className="mutedText">
              · {live.status}
              {live.scheduledAt && ` · ${live.scheduledAt.toLocaleString()}`}
              {live.requiredTierId && " · member-only"}
            </span>
          </span>
          <Link href={`/live/${live.id}`} className="button buttonSecondary buttonSmall">Manage</Link>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Schedule a livestream</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <LivestreamForm ownTiers={myTiers} />
        </div>
      </details>
    </div>
  );
}
