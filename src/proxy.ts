import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// custom-domains addendum §6.1: yourname.com/* mirrors 0dot.in/@handle/*
// (or acme.com/* mirrors 0dot.in/b/business/*) in full — every public path
// under the identity, not just a root landing page. Achieved as a plain
// path-prefix rewrite rather than per-page host detection, because every
// public per-user/per-business route in this app already lives nested
// under /[username]/... or /b/[slug]/... (src/app/[username]/articles,
// /wiki, /books, /files, /courses, etc.) — prefixing the incoming path with
// that same segment lands on the identical route Next.js would already
// resolve at 0dot.in/@handle/that/path. Internal navigation
// (`<Link href={`/${handle}/...`}>` throughout this codebase) is already
// relative, not absolute-to-0dot.in, so it keeps working unmodified after
// this rewrite — no host-aware link-generation retrofit needed.
//
// This is Next 16's `proxy.ts` (renamed from `middleware.ts` — see
// AGENTS.md). The custom-domain lookup itself lives behind
// /api/internal/custom-domain-route, a Route Handler, rather than a direct
// Prisma call in this file — despite the docs' "Proxy defaults to the
// Node.js runtime" claim, this project's dev tooling still bundles/labels
// Proxy's execution context "edge-server", and Prisma's libsql-native
// adapter (src/lib/db.ts) doesn't survive that: a direct `db.customDomain`
// call here came back with `db` object present but `customDomain`
// undefined. Route Handlers in this same app have no such issue, so the
// lookup is delegated there and fetched — see that route's own comment.
//
// isOwnHost below skips the lookup (and its network round-trip) entirely
// for the overwhelming majority of requests — anything hitting this app's
// own domain rather than a third-party custom domain — so normal traffic
// pays no extra cost.
function isOwnHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".vercel.app")) return true;
  try {
    if (process.env.APP_ORIGIN && host === new URL(process.env.APP_ORIGIN).hostname) return true;
  } catch {
    // malformed APP_ORIGIN — fall through to the custom-domain lookup rather than crash Proxy
  }
  return false;
}

// §6.2's read-only boundary is deliberately *not* enforced here with extra
// code: a rewrite keeps the browser on yourname.com throughout, so the
// session cookie set for 0dot.in's own origin is never sent (ordinary
// browser cookie scoping) — a Server Action reached this way sees no user,
// same as any other unauthenticated request. The one known rough edge
// this doesn't polish: requireVerifiedUser's redirect("/login") then
// renders login *on* yourname.com instead of bouncing to 0dot.in's login —
// a real gap for a follow-up pass, not silently ignored, but out of scope
// for this build alongside everything else it already covers.
export default async function proxy(request: NextRequest): Promise<Response | undefined> {
  const hostHeader = request.headers.get("host");
  if (!hostHeader) return NextResponse.next();

  const host = hostHeader.split(":")[0].toLowerCase();
  if (isOwnHost(host)) return NextResponse.next();

  let prefix: string | null = null;
  try {
    const lookupUrl = new URL("/api/internal/custom-domain-route", request.nextUrl.origin);
    lookupUrl.searchParams.set("host", host);
    const res = await fetch(lookupUrl);
    if (res.ok) {
      const data = (await res.json()) as { prefix: string | null };
      prefix = data.prefix;
    }
  } catch {
    prefix = null; // lookup failure falls through to normal routing rather than breaking the request
  }
  if (!prefix) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = url.pathname === "/" ? prefix : `${prefix}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|sitemap.xml|robots.txt).*)"],
};
