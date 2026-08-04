import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { approveDeveloperAppScope, rejectDeveloperAppScope } from "@/app/actions/admin-developer";

// spec §4.3's review queue: only high-sensitivity scope requests ever land
// at "pending" in the first place (requestDeveloperAppScope, oauth.ts
// auto-approves low/medium) — this is exclusively the sensitive-scope gate,
// not a general app-approval queue (DeveloperApp itself has no review step).
export default async function AdminDeveloperScopesPage() {
  await requirePlatformAdmin();

  const pending = await db.developerAppScope.findMany({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
    include: { app: true, scope: true },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Pending scope requests</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        High-sensitivity OAuth scopes an app can&apos;t request from any user until approved (spec §4.3).
      </p>

      {pending.length === 0 ? (
        <p className="mutedText">Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {pending.map((row) => (
            <div key={`${row.appId}:${row.scopeKey}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <strong>{row.app.name}</strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  requests {row.scopeKey} — {row.scope.description}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <form action={approveDeveloperAppScope}>
                  <input type="hidden" name="appId" value={row.appId} />
                  <input type="hidden" name="scopeKey" value={row.scopeKey} />
                  <button type="submit" className="button buttonSmall">
                    Approve
                  </button>
                </form>
                <form action={rejectDeveloperAppScope}>
                  <input type="hidden" name="appId" value={row.appId} />
                  <input type="hidden" name="scopeKey" value={row.scopeKey} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
