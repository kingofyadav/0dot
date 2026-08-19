import type { NextConfig } from "next";

// ThemeInitScript (src/components/ThemeInitScript.tsx) is the one inline
// <script> this app renders — a fixed, hardcoded string, never
// user-controlled — so it's allowlisted by exact content hash rather than
// the much weaker 'unsafe-inline', which would allow *any* inline script
// including an injected one. Recompute this hash (sha256 -a256 base64) if
// ThemeInitScript's __html string ever changes; a stale hash just breaks
// the theme-flash prevention (CSP-blocked, fails silently), not a security
// issue, but worth knowing why theming stopped working before assuming
// something else broke.
const THEME_INIT_SCRIPT_HASH = "sha256-NS35Khd+BOaVJl4isgTdECxTR4FruWyhpf513T4u0EU=";

// LiveKit's connect host is only known at runtime (LIVEKIT_URL, self-hosted
// or LiveKit Cloud) — read here since next.config.ts is plain Node
// evaluated at build time, so a deployment's own env is baked into its own
// CSP rather than this being a hardcoded guess. If LIVEKIT_URL isn't set at
// build time, voice rooms/livestreams simply don't get a connect-src entry
// and the browser will CSP-block their WebSocket connection — check that
// env var first if voice/livestream features stop connecting after this
// header rollout.
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

const CSP = [
  "default-src 'self'",
  `script-src 'self' '${THEME_INIT_SCRIPT_HASH}'`,
  "style-src 'self' 'unsafe-inline'", // Tailwind's runtime + component-library inline styles have no static hash to pin
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  "media-src 'self' https://*.public.blob.vercel-storage.com",
  ["connect-src", "'self'", "https://*.public.blob.vercel-storage.com", "https://vitals.vercel-insights.com", ...livekitConnectSrc()].join(" "),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
