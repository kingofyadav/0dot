import { redirect } from "next/navigation";
import { AppWindow, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CreateDeveloperAppForm } from "@/components/CreateDeveloperAppForm";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";

// phase-10 spec §9: primarily a rendering surface over DeveloperApp/
// OAuthAuthorization/WebhookSubscription, same "view over existing data,
// not a new data island" posture as Phase 6's Resume section.
export default async function DeveloperAppsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [ownApps, ownedBusinesses] = await Promise.all([
    db.developerApp.findMany({
      where: { OR: [{ ownerUserId: currentUser.id }, { ownerBusiness: { members: { some: { userId: currentUser.id, role: "owner" } } } }] },
      orderBy: { createdAt: "desc" },
      include: { ownerBusiness: { select: { name: true } } },
    }),
    db.business.findMany({ where: { members: { some: { userId: currentUser.id, role: "owner" } } }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Developer apps</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Register an app to use the 0dot API, offer &quot;Sign in with 0dot&quot;, or receive webhooks. Every API/webhook
        consumer — including your own internal automation — registers here.
      </p>

      {ownApps.length === 0 ? (
        <EmptyState message="No apps registered yet." />
      ) : (
        <div className="settingsGroup">
          {ownApps.map((app) => (
            <SettingsRow
              key={app.id}
              href={`developer/${app.id}`}
              icon={AppWindow}
              label={app.name}
              description={`${app.ownerBusiness ? `Owned by ${app.ownerBusiness.name}` : "Owned by you"} · ${app.status}`}
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
            <span className="settingsRowLabel">Register a new app</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <CreateDeveloperAppForm businesses={ownedBusinesses} />
        </div>
      </details>
    </div>
  );
}
