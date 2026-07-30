import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
