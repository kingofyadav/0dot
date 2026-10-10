import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

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
  // Wildcarded on the store-id subdomain rather than one literal hostname —
  // dev/preview/production each have their own Vercel Blob store, so a
  // single hardcoded host would only work for whichever one that literal
  // happened to name. AVIF/WebP negotiation wasn't possible for any remote
  // image at all before this (next/image refuses an unlisted remote host),
  // which is why user-content images (avatars, post media) still render as
  // plain <img> in several places — see the `next/next/no-img-element`
  // eslint-disable comments next to them; each is safe to reconsider now
  // that a host is actually configured, not a decision to leave standing.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    formats: ["image/avif", "image/webp"],
  },
  // Keep these heavy, Node-only SDKs out of the Server Components / Route
  // Handler bundle — Turbopack otherwise parses and inlines them into shared
  // server chunks, so a cold function pays to evaluate all of LiveKit +
  // nodemailer even on a route (the landing page) that touches
  // none of them. External = a plain runtime `require()`, loaded lazily the
  // first time the code path that needs it actually runs. `@libsql/client`
  // and `@prisma/client` are already external via Next's built-in list.
  serverExternalPackages: [
    "nodemailer",
    "livekit-server-sdk",
    "qrcode",
    "otplib",
  ],
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
  // yoursname.com = local custom-domain test host (127.0.0.1 in /etc/hosts); 10.0.2.2 = Android emulator's host-loopback address
  allowedDevOrigins: ["192.168.0.114", "192.168.0.122", "10.0.2.2", "yoursname.com"],
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
    // Was briefly `true` to avoid ~210ms of render-blocking <link> tags on
    // "/" — but Next's RSC flight payload (the self.__next_f.push blob every
    // page carries for hydration) serializes the *same* CSS text a second
    // time regardless, as style-preinit instructions for client-side
    // navigations. With this app's full stylesheet (~170KB) that's ~350KB+
    // of duplicated CSS on every single page load, with zero cross-page
    // browser caching — measured live-site Lighthouse performance scores of
    // 78 (/) and 83 (/login), both dominated by Total Blocking Time from
    // parsing that payload. A Vercel preview deploy with this `false`
    // (HTTP/2, so the <link> tags load in parallel off one connection
    // instead of serially like plain HTTP/1.1 localhost) scored 97–100 on
    // both once warm, with LCP still fine — the external, cacheable
    // stylesheet the browser now reuses across navigations wins by a wide
    // margin over the inlining trade this was meant to make.
    inlineCss: false,
  },
  // Next.js doesn't serve a /sitemap.xml index when sitemap.ts uses
  // generateSitemaps, and a route handler can't sit at that path (conflicts
  // with the metadata route), so serve the hand-built index from here.
  async rewrites() {
    return { beforeFiles: [{ source: "/sitemap.xml", destination: "/sitemap-index.xml" }] };
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
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "dotindia",

  project: "0dot",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
