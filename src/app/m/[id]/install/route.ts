import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { INSTALL_PKCE_COOKIE } from "@/lib/marketplace-oauth-install";

// Starting leg of the developerAppId-linked install flow (spec §8):
// generates this browser's own PKCE code_verifier, stashes it in a
// short-lived httpOnly cookie (this route and /m/install-callback are both
// first-party, so a cookie is a safe and simple way to carry it across the
// /oauth/authorize redirect — no client-side JS needs to see it), and sends
// the browser into the same consent screen a third-party app's users would
// see. Cookie is set directly on the returned NextResponse (response.cookies.set),
// not via the ambient cookies() store — a bare Response.redirect() here
// silently dropped the Set-Cookie header (verified in-browser: the code_verifier
// cookie never reached /m/install-callback), so the cookie is attached to the
// exact object we return instead of relying on Next's ambient merge.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const listing = await db.marketplaceListing.findUnique({ where: { id }, include: { developerApp: { include: { scopes: true } } } });
  if (!listing || listing.status !== "active" || listing.category !== "app" || !listing.developerApp) {
    return NextResponse.redirect(new URL(`/m/${id}`, request.url));
  }
  if (listing.price !== null) {
    const owns = await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId: id, buyerId: user.id } } });
    if (!owns) return NextResponse.redirect(new URL(`/m/${id}`, request.url));
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/m/install-callback`;
  if (!(JSON.parse(listing.developerApp.redirectUrisJson) as string[]).includes(redirectUri)) {
    return NextResponse.redirect(new URL(`/m/${id}?error=app_not_configured_for_install`, request.url));
  }

  const approvedScopes = listing.developerApp.scopes.filter((s) => s.status === "approved").map((s) => s.scopeKey);
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const authorizeUrl = new URL("/oauth/authorize", origin);
  authorizeUrl.searchParams.set("client_id", listing.developerApp.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", approvedScopes.join(" "));
  authorizeUrl.searchParams.set("state", id);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  // Path must be "/" (not "/m"): the browser bounces through /oauth/authorize
  // (outside /m) before landing back on /m/install-callback, and that
  // second hop is a same-origin redirect() from a Server Action — Next.js
  // resolves those internally by replaying the *original* incoming
  // request's cookies rather than re-fetching through the browser's cookie
  // jar. A cookie scoped to /m never reaches the POST to /oauth/authorize
  // in the first place, so it's unavailable for that replay even though
  // the browser genuinely has it stored (verified in-browser: a direct,
  // non-redirect-chained navigation to /m/install-callback did see the
  // cookie; only the redirect()-mediated hop lost it).
  response.cookies.set(INSTALL_PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
