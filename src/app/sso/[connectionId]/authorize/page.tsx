import { notFound } from "next/navigation";
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
  if (!connection || !email) notFound();

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
