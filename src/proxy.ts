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
// LiveKit's connect host is only known at runtime (LIVEKIT_URL, self-hosted
// or LiveKit Cloud) — read per-request here (Proxy runs on every request,
// unlike next.config.ts's headers() which only runs once at build time) so
// a deployment's own env is reflected live rather than baked into the build.
function livekitConnectSrc(): string[] {
  const url = process.env.LIVEKIT_URL;
  if (!url) return [];
  try {
    const host = new URL(url).host;
    return [`wss://${host}`, `https://${host}`];
  } catch {
    return [];
  }
}

// Nonce-based CSP, not a static hash: Next.js injects a fresh, per-request
// inline <script> on every page to carry RSC flight data for hydration
// (self.__next_f.push), whose content (and hash) differs on every request —
// a fixed script-src can never allowlist those. Next.js reads the nonce back
// out of this response's Content-Security-Policy header and threads it
// through its own inline scripts automatically (framework runtime, flight
// data, page bundles); 'strict-dynamic' lets those framework scripts load
// further scripts they trust without needing their own explicit allowlist
// entries. See https://nextjs.org/docs/app/guides/content-security-policy.
// The one inline script this app authors itself (ThemeInitScript) is NOT
// covered by Next's auto-injection — layout.tsx reads x-nonce below and
// applies it to that script's `nonce` attribute manually.
function buildCsp(nonce: string): string {
  // 'unsafe-eval' only outside production: React dev mode and Turbopack HMR
  // use eval() for debugging features (e.g. reconstructing component stacks)
  // that don't exist in a production build, which never needs or gets this.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'");

  // VERCEL_ENV (not NODE_ENV, which is "production" for preview builds too)
  // is how Vercel's own build distinguishes a real production deploy from a
  // preview one. Preview deploys auto-inject the Vercel Toolbar, which
  // embeds https://vercel.live in an <iframe> and talks to it over
  // fetch/WebSocket — with no frame-src/connect-src/script-src entry for
  // it, default-src 'self' silently blocked the iframe (a CSP violation
  // logged to the console on every preview page load). Real production
  // traffic never gets the toolbar, so it gets none of this allowance.
  const isPreview = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
  if (isPreview) scriptSrc.push("https://vercel.live");

  const connectSrc = ["'self'", "https://*.public.blob.vercel-storage.com", "https://vitals.vercel-insights.com", ...livekitConnectSrc()];
  const frameSrc = ["'self'"];
  if (isPreview) {
    connectSrc.push("https://vercel.live", "wss://*.pusher.com");
    frameSrc.push("https://vercel.live");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind's runtime + component-library inline styles have no static hash/nonce to pin
    "img-src 'self' data: https://*.public.blob.vercel-storage.com",
    "media-src 'self' https://*.public.blob.vercel-storage.com",
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

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
// x-pathname makes the current path readable from Server Components via
// headers() (route-context.ts's isChromelessPath/isProfilePagePath, read by
// RootLayout and SiteHeader) — there's no other way to get route data into
// a layout. Must go through NextResponse's `request.headers` init (forwards
// upstream to the render) rather than `response.headers.set` (only reaches
// the browser) — see this Next version's proxy.md "Setting Headers" section.
// Set on every return path below, including the custom-domain rewrite,
// where it reflects the *rewritten* pathname (the page actually rendered),
// not the third-party host's original request path.
export default async function proxy(request: NextRequest): Promise<Response | undefined> {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Applied on every return path below (mirrors x-pathname's own comment):
  // the CSP header must reach the browser response, not just the upstream
  // render, or the nonce Next.js embeds in its scripts won't match what the
  // browser is told to trust.
  function withCsp(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const hostHeader = request.headers.get("host");
  if (!hostHeader) return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const host = hostHeader.split(":")[0].toLowerCase();
  if (isOwnHost(host)) return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

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
  if (!prefix) return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const url = request.nextUrl.clone();
  url.pathname = url.pathname === "/" ? prefix : `${prefix}${url.pathname}`;
  requestHeaders.set("x-pathname", url.pathname);
  return withCsp(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
}

// manifest.json/sw.js/the home-screen icon files are requested by the
// browser at absolute root paths (<link rel="manifest" href="/manifest.json">,
// navigator.serviceWorker.register("/sw.js"), icons.apple in layout.tsx)
// regardless of which host served the HTML. Without excluding them here the
// same way favicon.ico already is, a visitor on a custom domain
// (yourname.com, per isOwnHost above) gets those requests rewritten to
// `${prefix}/manifest.json` etc., which 404s — silently breaking PWA
// installability (and the home-screen icon) for every custom-domain visitor.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|favicon.ico|sitemap.xml|robots.txt|manifest.json|sw.js|apple-touch-icon.png|0dot.png|1dot.png|icon-192.png|icon-512.png|icon-maskable-192.png|icon-maskable-512.png).*)",
  ],
};
