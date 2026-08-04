import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requireOwnedDeveloperApp } from "@/lib/developer-apps";
import { OAUTH_SCOPES, seedOAuthScopes } from "@/lib/oauth";
import { ALLOWED_WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";
import { rotateClientSecret, requestScope, deleteWebhookSubscription } from "@/app/actions/developer-apps";
import { RedirectUrisForm } from "@/components/RedirectUrisForm";
import { WebhookSubscriptionForm } from "@/components/WebhookSubscriptionForm";

const SCOPE_STATUS_LABEL: Record<string, string> = { pending: "Pending review", approved: "Approved", rejected: "Rejected" };

export default async function DeveloperAppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; appId: string }>;
  searchParams: Promise<{ newSecret?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { appId } = await params;
  const { newSecret } = await searchParams;

  const app = await requireOwnedDeveloperApp(appId, currentUser.id);
  if (!app) notFound();

  await seedOAuthScopes();

  const [appScopes, webhookSubscriptions, recentUsage] = await Promise.all([
    db.developerAppScope.findMany({ where: { appId }, include: { scope: true } }),
    db.webhookSubscription.findMany({ where: { appId }, orderBy: { createdAt: "desc" } }),
    db.apiUsageCounter.findMany({ where: { appId }, orderBy: { windowStart: "desc" }, take: 24 }),
  ]);
  const requestedScopeKeys = new Set(appScopes.map((s) => s.scopeKey));

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">{app.name}</h2>

      {newSecret && (
        <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem", marginBottom: "1rem", borderColor: "var(--danger)" }}>
          <strong>Save your client secret now — it won&apos;t be shown again:</strong>
          <code style={{ wordBreak: "break-all", fontSize: "0.85rem" }}>{newSecret}</code>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Credentials</p>
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          client_id: <code>{app.clientId}</code>
        </p>
        <form action={rotateClientSecret} style={{ marginTop: "0.4rem" }}>
          <input type="hidden" name="appId" value={app.id} />
          <button type="submit" className="button buttonSecondary buttonSmall">
            Rotate client secret
          </button>
        </form>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Redirect URIs</p>
        <RedirectUrisForm appId={app.id} redirectUris={JSON.parse(app.redirectUrisJson)} />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Scopes</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {OAUTH_SCOPES.map((scope) => {
            const requested = appScopes.find((s) => s.scopeKey === scope.key);
            return (
              <div key={scope.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
                <span>
                  {scope.key} <span className="mutedText">({scope.sensitivity})</span>
                </span>
                {requested ? (
                  <span className="mutedText">{SCOPE_STATUS_LABEL[requested.status] ?? requested.status}</span>
                ) : (
                  <form action={requestScope}>
                    <input type="hidden" name="appId" value={app.id} />
                    <input type="hidden" name="scopeKey" value={scope.key} />
                    <button type="submit" className="button buttonSmall">
                      Request
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        {!requestedScopeKeys.size && <p className="mutedText" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>Low/medium-sensitivity scopes are approved instantly; high-sensitivity scopes need admin review.</p>}
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Webhooks</p>
        {webhookSubscriptions.length === 0 && <p className="mutedText">No webhook subscriptions yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {webhookSubscriptions.map((sub) => (
            <div key={sub.id} className="profileLinkItem" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {sub.targetUrl} · {JSON.parse(sub.eventTypesJson).join(", ")} · {sub.status}
              </span>
              <form action={deleteWebhookSubscription}>
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        <WebhookSubscriptionForm appId={app.id} eventTypes={ALLOWED_WEBHOOK_EVENT_TYPES} />
      </div>

      <div>
        <p className="sectionHeading">API usage (last 24 hourly windows)</p>
        {recentUsage.length === 0 && <p className="mutedText">No API requests yet.</p>}
        {recentUsage.length > 0 && (
          <p className="mutedText" style={{ fontSize: "0.85rem" }}>
            {recentUsage.reduce((sum, row) => sum + row.requestCount, 0)} requests total
          </p>
        )}
      </div>
    </div>
  );
}
