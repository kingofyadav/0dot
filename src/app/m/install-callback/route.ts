import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { exchangeAuthorizationCode } from "@/lib/oauth";
import { INSTALL_PKCE_COOKIE } from "@/lib/marketplace-oauth-install";

// Landing leg of the developerAppId-linked install flow (spec §8's
// acceptance criterion: installing produces a real OAuthAuthorization, not
// just an InstalledApp config blob). `state` carries the listingId — this
// route is first-party, so there's no need for a separate CSRF-state
// lookup table the way a third-party app's own callback would need one.
// Redirects use NextResponse (not bare Response.redirect) so the cookie
// deletion below attaches to the exact response returned — see
// /m/[id]/install's comment for why a bare Response.redirect() can't be
// trusted to carry cookie mutations here.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const listingId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !listingId) return NextResponse.redirect(new URL(listingId ? `/m/${listingId}` : "/m", url.origin));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get(INSTALL_PKCE_COOKIE)?.value;

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || !listing.developerAppId || !code || !codeVerifier) {
    const response = NextResponse.redirect(new URL(`/m/${listingId}?error=install_failed`, url.origin));
    response.cookies.delete(INSTALL_PKCE_COOKIE);
    return response;
  }

  const result = await exchangeAuthorizationCode({
    code,
    codeVerifier,
    redirectUri: `${url.origin}/m/install-callback`,
    appId: listing.developerAppId,
  });
  if ("error" in result) {
    const response = NextResponse.redirect(new URL(`/m/${listingId}?error=install_failed`, url.origin));
    response.cookies.delete(INSTALL_PKCE_COOKIE);
    return response;
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (profile) {
    const existing = await db.installedApp.findFirst({ where: { listingId, installerUserId: profile.id } });
    if (!existing) {
      await db.installedApp.create({ data: { listingId, installerType: "user", installerUserId: profile.id } });
    }
  }

  const response = NextResponse.redirect(new URL(`/m/${listingId}`, url.origin));
  response.cookies.delete(INSTALL_PKCE_COOKIE);
  return response;
}
