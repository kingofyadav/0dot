import type { NextConfig } from "next";

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
  // The dev-mode "N" badge Next.js overlays in the bottom-left corner sits
  // directly on top of the left sidebar's bottom edge — disabled so it
  // doesn't obscure sidebar content during development.
  devIndicators: false,
  allowedDevOrigins: ["192.168.0.114", "192.168.0.122"],
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

export default nextConfig;
