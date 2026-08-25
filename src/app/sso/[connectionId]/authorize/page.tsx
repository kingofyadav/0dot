import Link from "next/link";
import { db } from "@/lib/db";
import { completeSsoLogin } from "@/app/actions/sso";

// Stands in for the redirect-to-IdP step of a real SAML2/OIDC flow (spec
// §5.4 flags real assertion verification as needing dedicated security
// review, not built here — see sso.ts). This page plays the role the
// third-party IdP's own login screen would.
export default async function SsoAuthorizePage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { connectionId } = await params;
  const { email } = await searchParams;

  const connection = await db.sSOConnection.findUnique({
    where: { id: connectionId },
    include: { organization: { select: { name: true, domain: true } } },
  });
  // A specific message rather than falling to the generic site 404 (which
  // read as "this whole page is broken" rather than "this link is stale") —
  // no anti-enumeration concern here unlike aff/r's codes: an SSO
  // connectionId isn't a secret, just an internal id from a work-email
  // lookup (see startSsoLogin), so naming the actual problem is fine.
  if (!connection || !email) {
    return (
      <div className="profileCard" style={{ maxWidth: "420px", margin: "3rem auto" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Sign-in link unavailable</h1>
        <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
          This SSO sign-in link is invalid or has expired. Try signing in again.
        </p>
        <Link href="/login" className="button">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="profileCard" style={{ maxWidth: "420px", margin: "3rem auto" }}>
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>{connection.organization.name}</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Simulated {connection.protocol === "saml2" ? "SAML 2.0" : "OIDC"} identity provider — a stand-in
        for the real corporate login screen you&apos;d be redirected to.
      </p>

      <form action={completeSsoLogin} className="authCard" style={{ maxWidth: "none" }}>
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="email" value={email} />
        <p>
          Continue as <strong>{email}</strong>?
        </p>
        <button type="submit" className="button">
          Sign in
        </button>
      </form>
    </div>
  );
}
