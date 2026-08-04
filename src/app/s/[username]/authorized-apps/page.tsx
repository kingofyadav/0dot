import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revokeOwnAuthorization } from "@/app/actions/developer-apps";

// spec §4.4's literal acceptance criterion: every user gets an
// account-settings view listing active OAuthAuthorizations with their
// granted scopes and a one-click revoke — the practical transparency
// mechanism behind "Sign in with 0dot" existing at all.
export default async function AuthorizedAppsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const authorizations = await db.oAuthAuthorization.findMany({
    where: { userId: currentUser.id, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { app: { select: { name: true, description: true } } },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Authorized apps</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Apps you&apos;ve signed in with or granted access to your 0dot account.
      </p>

      {authorizations.length === 0 && <p className="mutedText">No apps authorized.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {authorizations.map((authorization) => (
          <div key={authorization.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{authorization.app.name}</strong>
              <form action={revokeOwnAuthorization}>
                <input type="hidden" name="authorizationId" value={authorization.id} />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Revoke
                </button>
              </form>
            </div>
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              Scopes: {(JSON.parse(authorization.grantedScopesJson) as string[]).join(", ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
