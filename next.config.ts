import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Browser source maps are emitted ONLY when the Sentry build hook will
// upload and then delete them (see `deleteSourcemapsAfterUpload` below,
// which — like this — is gated on SENTRY_AUTH_TOKEN). Without the token the
// Sentry plugin is inert: it neither uploads nor strips, so an
// unconditional `productionBrowserSourceMaps: true` made Turbopack ship
// full .js.map files (and their `sourceMappingURL` comments) to every
// visitor on any build lacking the token — local `next build`, preview
// deploys, and self-hosted production all leak complete source. On Vercel
// production the Sentry↔Vercel integration injects the token, so maps are
// still generated there for symbolication and then removed before ship.
const sentryWillUploadAndStripSourcemaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

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
  // true. `deleteSourcemapsAfterUpload` below is what removes the maps from
  // the shipped output — but only when Sentry actually runs (token present),
  // which is why this flag is gated on the same condition: no token ⇒ no
  // strip step ⇒ don't emit maps in the first place.
  productionBrowserSourceMaps: sentryWillUploadAndStripSourcemaps,
  // The dev-mode "N" badge Next.js overlays in the bottom-left corner sits
  // directly on top of the left sidebar's bottom edge — disabled so it
  // doesn't obscure sidebar content during development.
  devIndicators: false,
  allowedDevOrigins: ["192.168.0.114", "192.168.0.122", "10.0.2.2"], // 10.0.2.2 = Android emulator's host-loopback address
  experimental: {
    serverActions: {
      // Default is 1MB. Post images no longer flow through a Server Action
      // at all — ComposeBox uploads them straight to Vercel Blob via
      // /api/upload/post-media (client-direct `upload()`), so createPost
      // receives only URLs. This ceiling is kept at 34mb for the *other*
      // Server Action upload paths that still take file bytes: a book's
      // cover + ebook in one createBook call (books.ts, ~25MB combined),
      // message/document attachments (src/lib/uploads.ts, 20MB).
      // KNOWN DEBT: createProduct / course-lesson / published-file uploads
      // (digital-products.ts, courses.ts) pass maxBytes of 200–500MB to
      // saveProtectedFile but are still Server Actions — anything over this
      // limit already fails. They should move to the same client-direct
      // Blob upload pattern as post media in a follow-up.
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
