import { NextResponse } from "next/server";
import { getLiveCustomDomainByHost } from "@/lib/custom-domains";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Internal-only lookup src/proxy.ts calls over fetch() rather than
// querying Prisma directly from Proxy's own execution context — that
// context is still bundled/labeled "edge-server" by Next's dev tooling
// (confirmed by `db.customDomain` coming back undefined when called
// directly from proxy.ts), even though Route Handlers in this same app
// have no such issue. Returns no sensitive data — just the path prefix a
// live custom domain's host should rewrite to — but "internal to this app"
// isn't actually enforced: there's no middleware layer in front of
// /api/internal/* (proxy.ts's own matcher explicitly excludes api/), so
// this Route Handler is reachable by anyone, not just proxy.ts. Rate
// limited to prevent using it as a bulk host→username/business-slug
// enumeration tool; not gated behind a shared secret since that would need
// a production env var this app doesn't have yet and the data returned
// isn't sensitive enough to justify blocking normal custom-domain traffic
// if that var is ever unset.
export async function GET(request: Request): Promise<Response> {
  const ip = await getClientIp();
  if (!checkRateLimit(`custom-domain-route:ip:${ip}`, { max: 60, windowMs: 60 * 1000 })) {
    return NextResponse.json({ prefix: null }, { status: 429 });
  }

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
