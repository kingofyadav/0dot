import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CreateDeveloperAppForm } from "@/components/CreateDeveloperAppForm";

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

      <div style={{ marginBottom: "1.5rem" }}>
        {ownApps.length === 0 && <p className="mutedText">No apps registered yet.</p>}
        {ownApps.map((app) => (
          <Link key={app.id} href={`developer/${app.id}`} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{app.name}</strong>{" "}
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {app.ownerBusiness ? `owned by ${app.ownerBusiness.name}` : "owned by you"} · {app.status}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <details className="profileEditToggle">
        <summary>Register a new app</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <CreateDeveloperAppForm businesses={ownedBusinesses} />
        </div>
      </details>
    </div>
  );
}
