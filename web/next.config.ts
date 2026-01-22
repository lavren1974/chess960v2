import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Serve piece assets from /public root under /pieces/* for convenience
      { source: "/pieces/:path*", destination: "/:path*" },
    ];
  },
};

export default nextConfig;
