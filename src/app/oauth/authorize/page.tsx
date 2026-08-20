import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { validateRedirectUri, resolveApprovableScopes, seedOAuthScopes } from "@/lib/oauth";
import { approveAuthorization, denyAuthorization } from "@/app/actions/oauth";
import { ensureFirstPartyApps, isFirstPartyOwner } from "@/lib/first-party-apps";

// "Sign in with 0dot" consent screen (spec §4.2/§4.4) — the one page every
// third-party app's authorization-code flow redirects a browser to. Renders
// only the scopes the app is actually approved to request (resolveApprovableScopes,
// oauth.ts) — a scope pending the §4.3 review gate never reaches this
// screen, so a user is never asked to approve something the app hasn't
// cleared review for.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{
    client_id?: string;
    redirect_uri?: string;
    response_type?: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }>;
}) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType, scope, state, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod } = params;

  if (!clientId || !redirectUri || !codeChallenge || responseType !== "code") {
    return <ErrorPanel message="This authorization request is missing required parameters." />;
  }

  const app = await db.developerApp.findUnique({ where: { clientId } });
  if (!app || app.status !== "active") {
    return <ErrorPanel message="Unknown or suspended application." />;
  }
  if (!validateRedirectUri(app.redirectUrisJson, redirectUri)) {
    return <ErrorPanel message="This application's redirect URI isn't registered." />;
  }

  await seedOAuthScopes();
  const requestedScopeKeys = (scope ?? "").split(" ").filter(Boolean);
  let grantable = await resolveApprovableScopes(app.id, JSON.stringify(requestedScopeKeys));
  if ("error" in grantable && (await isFirstPartyOwner(app.ownerUserId))) {
    // Self-heal, mirroring getFirstPartyClientIds' fallback (first-party-apps.ts):
    // instrumentation.ts's register() is supposed to have already backfilled
    // DeveloperAppScope approval for this app's catalog scopes at boot, but an
    // earlier, unrelated scheduler throwing there aborts register() before it
    // gets there — leaving a first-party app's own sign-in permanently
    // rejecting with "isn't approved to request" until the next successful
    // boot. Retried here, once, only for apps 0dot itself owns (isFirstPartyOwner)
    // — a third-party app's unapproved scope must still fail closed.
    await ensureFirstPartyApps();
    grantable = await resolveApprovableScopes(app.id, JSON.stringify(requestedScopeKeys));
  }
  if ("error" in grantable) {
    return <ErrorPanel message={grantable.error} />;
  }

  const scopeRows = await db.oAuthScope.findMany({ where: { key: { in: grantable.scopes } } });

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Authorize {app.name}</h1>
        <p className="mutedText">
          {app.name} wants to access your 0dot account ({user.email}). This will let it:
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {scopeRows.map((s) => (
            <li key={s.key}>{s.description}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <form action={approveAuthorization}>
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="redirectUri" value={redirectUri} />
            <input type="hidden" name="state" value={state ?? ""} />
            <input type="hidden" name="codeChallenge" value={codeChallenge} />
            <input type="hidden" name="codeChallengeMethod" value={codeChallengeMethod ?? "S256"} />
            {grantable.scopes.map((key) => (
              <input key={key} type="hidden" name="scopes" value={key} />
            ))}
            <button type="submit" className="button">
              Authorize {app.name}
            </button>
          </form>
          <form action={denyAuthorization}>
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="redirectUri" value={redirectUri} />
            <input type="hidden" name="state" value={state ?? ""} />
            <button type="submit" className="button buttonSecondary">
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Can&apos;t authorize this app</h1>
        <p className="mutedText">{message}</p>
      </div>
    </div>
  );
}
