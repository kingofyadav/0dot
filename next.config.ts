import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy is intentionally NOT set here. next.config.ts's
// headers() is evaluated once at build time and applies a fixed string to
// every response — but Next.js injects a fresh, per-request inline <script>
// on every page to carry RSC flight data for hydration (self.__next_f.push),
// whose content (and therefore hash) differs on every request. A static
// script-src (even a correct hash for our own ThemeInitScript) can never
// cover those, so it blocked Next's own hydration scripts outright —
// production shipped a blank page on every route. CSP now lives in
// proxy.ts, generated per-request with a nonce, which Next.js reads back
// out of the response header and threads through its own inline scripts
// automatically (see https://nextjs.org/docs/app/guides/content-security-policy#nonces).
const nextConfig: NextConfig = {
  // The browser Sentry SDK (src/instrumentation-client.ts) can only read
  // NEXT_PUBLIC_* vars. A DSN is not a secret, so rather than maintain a
  // second Vercel env var we inline the server SENTRY_DSN here at build time.
  // Empty string when unset keeps the client init inert.
  env: {
    NEXT_PUBLIC_SENTRY_DSN:
      process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "",
  },
  // Drop the `x-powered-by: Next.js` response header — free framework
  // fingerprinting for anyone matching the stack against known CVEs.
  poweredByHeader: false,
  // Sentry's Turbopack integration stamps every client chunk with a
  // `//# debugId=` comment (see withSentryConfig below) whether or not this
  // is on, but its upload step ("Could not auto-detect referenced
  // sourcemap for ~/X.js") needs a real .js.map file to associate that
  // debug ID with — which Next.js/Turbopack only emits at all when this is
  // true. `deleteSourcemapsAfterUpload` below (not this flag) is what keeps
  // the maps from actually shipping to visitors.
  productionBrowserSourceMaps: true,
  // The dev-mode "N" badge Next.js overlays in the bottom-left corner sits
  // directly on top of the left sidebar's bottom edge — disabled so it
  // doesn't obscure sidebar content during development.
  devIndicators: false,
  allowedDevOrigins: ["192.168.0.114", "192.168.0.122", "10.0.2.2"], // 10.0.2.2 = Android emulator's host-loopback address
  experimental: {
    serverActions: {
      // Default is 1MB. Raised for post composing: up to 4 images per
      // post at up to 8MB each (see MAX_MEDIA_BYTES in
      // src/app/actions/posts.ts), plus multipart overhead.
      bodySizeLimit: "34mb",
    },
    // `radix-ui` is the unified meta-package (see src/components/ui/*) — it
    // re-exports every primitive, so a bare `import { X } from "radix-ui"`
    // can drag unrelated primitives into the bundle. This rewrites each such
    // import to its direct submodule path. lucide-react (86 import sites) is
    // already optimized by Next's built-in default list, so it isn't
    // repeated here (see node_modules/next/dist/docs/.../optimizePackageImports.md).
    optimizePackageImports: ["radix-ui"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

// Sentry (web-pro-upgrade addendum M1). withSentryConfig only does
// meaningful build-time work — source-map upload — when SENTRY_AUTH_TOKEN is
// present (injected by the Vercel↔Sentry integration on production builds).
// Locally and in CI it's a near-no-op: no token, no upload, no sentry-cli
// invocation. Runtime error capture is driven by src/instrumentation.ts and
// src/instrumentation-client.ts (Sentry.init called directly), not by this
// wrapper.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    // productionBrowserSourceMaps above means Next now actually emits
    // .js.map files (needed for Sentry's Turbopack upload step to find
    // them at all — see that flag's comment). Without this, those maps
    // would ship to every visitor, publicly exposing full source. Sentry's
    // own runAfterProductionCompile hook uploads them first, then strips
    // the maps and their `sourceMappingURL` comments from the shipped
    // output — so production stays clean while Sentry still gets full
    // stack-trace symbolication.
    deleteSourcemapsAfterUpload: true,
  },
  // Sentry's own tunnelRoute is injected by its webpack plugin, which this
  // Turbopack build never runs. The tunnel is hand-written instead at
  // src/app/api/monitoring/route.ts (client SDK points at it via `tunnel`).
  tunnelRoute: undefined,
});
