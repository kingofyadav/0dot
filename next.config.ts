import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, too small for an avatar/cover image upload.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
