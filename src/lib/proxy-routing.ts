// Pure routing/CSP helpers for src/proxy.ts, split out so they're unit
// testable without a NextRequest. No `next/*` import and deliberately no
// `import "server-only"` — proxy.ts's execution context is bundled/labeled
// "edge-server" by this project's dev tooling (see proxy.ts's own comment),
// and this module has to survive that.

// LiveKit's connect host is only known at runtime (LIVEKIT_URL, self-hosted
// or LiveKit Cloud) — read per-request (Proxy runs on every request, unlike
// next.config.ts's headers() which only runs once at build time) so a
// deployment's own env is reflected live rather than baked into the build.
export function livekitConnectSrc(): string[] {
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
// covered by Next's auto-injection — layout.tsx reads x-nonce and applies
// it to that script's `nonce` attribute manually.
export function buildCsp(nonce: string): string {
  // 'unsafe-eval' only outside production: React dev mode and Turbopack HMR
  // use eval() for debugging features (e.g. reconstructing component stacks)
  // that don't exist in a production build, which never needs or gets this.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'");

  // NOT adding https://vercel.live here: with 'strict-dynamic' present (just
  // above), the browser ignores every host-based entry in script-src by
  // spec — only a matching nonce, or a script dynamically inserted by an
  // already-nonce-trusted script, can execute. The Vercel Toolbar's script
  // tag is injected by Vercel's edge without this app's per-request nonce,
  // so no script-src entry can let it load short of dropping
  // 'strict-dynamic' entirely — a real regression, since every legitimate
  // framework script currently relies on it instead of a broad host
  // allowlist. Confirmed live: adding "https://vercel.live" here did not
  // stop "Loading the script 'https://vercel.live/_next-live/...' violates
  // ... script-src" — this is a documented CSP3 strict-dynamic interaction,
  // not a missing allowlist entry. The frame-src/connect-src entries below
  // ARE real (those directives have no strict-dynamic semantics) but moot
  // on their own since the script that would use them never loads. If the
  // Toolbar's console noise matters, disable it for this project in
  // Vercel's dashboard (Project Settings → Toolbar) rather than loosening
  // this CSP — it's an optional team-member convenience, not end-user-facing.

  // *.public.blob.vercel-storage.com — blob object reads (<img>/<video>).
  // https://vercel.com — the client-direct post-image upload PUT
  // (src/app/feed/ComposeBox.tsx via @vercel/blob/client): the installed
  // SDK's browser `upload()` PUTs bytes to `https://vercel.com/api/blob`
  // (its default API origin, @vercel/blob/dist/chunk-YYMLUMXS.js
  // `defaultVercelBlobApiUrl`), not blob.vercel-storage.com — confirmed live
  // via `securitypolicyviolation` events on 0dot.in/feed: every image
  // attachment's upload was silently CSP-blocked (connect-src) before this
  // fix, so "Post" with an image attached never got past the token request.
  const connectSrc = [
    "'self'",
    "https://*.public.blob.vercel-storage.com",
    "https://blob.vercel-storage.com",
    "https://vercel.com",
    "https://vitals.vercel-insights.com",
    // wss://*.pusher.com: the Vercel Toolbar's realtime channel for live
    // comments — same "any authenticated team member, any environment"
    // trigger as the vercel.live entries above, so unconditional too.
    "wss://*.pusher.com",
    ...livekitConnectSrc(),
  ];
  // openstreetmap.org — /map (src/app/map/page.tsx) has no maps-SDK
  // dependency and embeds each pin as a plain, key-free OSM iframe
  // (osmEmbedSrc/defaultOsmEmbedSrc). frame-src 'self' silently blocked
  // every one of those in production ("This content is blocked. Contact
  // the site owner to fix the issue.", confirmed live via the iframe's
  // getBoundingClientRect matching the blocked-content placeholder box).
  //
  // https://vercel.live — the Vercel Toolbar's own iframe. Real, unlike the
  // script-src entry this directive doesn't have — see that comment above:
  // this alone doesn't make the Toolbar work (its script never loads to
  // open the iframe), but it's correct in isolation and costs nothing to
  // keep, unconditional for the same "viewer's own session, any
  // environment" reason as everywhere else vercel.live appears here.
  const frameSrc = ["'self'", "https://www.openstreetmap.org", "https://vercel.live"];

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

// A request whose Host is this app's own origin (or a local / preview host)
// rather than a third-party custom domain — skips the custom-domain lookup
// and its network round-trip entirely for the overwhelming majority of
// traffic.
export function isOwnHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".vercel.app")) return true;
  try {
    if (process.env.APP_ORIGIN && host === new URL(process.env.APP_ORIGIN).hostname) return true;
  } catch {
    // malformed APP_ORIGIN — fall through to the custom-domain lookup rather than crash Proxy
  }
  return false;
}

// custom-domains addendum §6.1: yourname.com/* mirrors 0dot.in/@handle/* in
// full. `prefix` is the identity segment ("/alice" or "/b/acme"); the
// incoming third-party-host pathname is nested under it so it resolves to
// the identical route Next.js would serve at 0dot.in/@handle/that/path.
export function customDomainRewritePath(pathname: string, prefix: string): string {
  return pathname === "/" ? prefix : `${prefix}${pathname}`;
}
