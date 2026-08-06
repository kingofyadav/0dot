import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revokeOwnAuthorization } from "@/app/actions/developer-apps";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";

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

      {authorizations.length === 0 ? (
        <EmptyState message="No apps authorized." />
      ) : (
        <div className="settingsGroup">
          {authorizations.map((authorization) => (
            <SettingsRow
              key={authorization.id}
              icon={KeyRound}
              label={authorization.app.name}
              description={`Scopes: ${(JSON.parse(authorization.grantedScopesJson) as string[]).join(", ")}`}
              trailing={
                <form action={revokeOwnAuthorization}>
                  <input type="hidden" name="authorizationId" value={authorization.id} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Revoke
                  </button>
                </form>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
