import { NextResponse } from "next/server";
import { getLiveCustomDomainByHost } from "@/lib/custom-domains";
import { db } from "@/lib/db";

// Internal-only lookup src/proxy.ts calls over fetch() rather than
// querying Prisma directly from Proxy's own execution context — that
// context is still bundled/labeled "edge-server" by Next's dev tooling
// (confirmed by `db.customDomain` coming back undefined when called
// directly from proxy.ts), even though Route Handlers in this same app
// have no such issue. Returns no sensitive data — just the path prefix a
// live custom domain's host should rewrite to, so no auth beyond "internal
// to this app" is needed.
export async function GET(request: Request): Promise<Response> {
  const host = new URL(request.url).searchParams.get("host");
  if (!host) return NextResponse.json({ prefix: null });

  const customDomain = await getLiveCustomDomainByHost(host);
  if (!customDomain) return NextResponse.json({ prefix: null });

  let prefix: string | null = null;
  if (customDomain.ownerType === "profile" && customDomain.ownerProfileId) {
    const profile = await db.profile.findUnique({
      where: { id: customDomain.ownerProfileId },
      select: { user: { select: { username: { select: { handle: true } } } } },
    });
    if (profile?.user.username) prefix = `/${profile.user.username.handle}`;
  } else if (customDomain.ownerType === "business" && customDomain.ownerBusinessId) {
    const business = await db.business.findUnique({ where: { id: customDomain.ownerBusinessId }, select: { slug: true } });
    if (business) prefix = `/b/${business.slug}`;
  }
  return NextResponse.json({ prefix });
}
