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
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // The RSC flight-data CSP nonce is generated per-request in proxy.ts;
  // don't add a Sentry tunnel route (it would need its own CSP allowance).
  tunnelRoute: undefined,
});
