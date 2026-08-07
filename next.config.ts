import type { NextConfig } from "next";

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
};

export default nextConfig;
