import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the app root to this folder (`web/`). If a lockfile exists higher in the tree
   * (e.g. home directory), Next otherwise mis-detects the workspace and tracing breaks.
   */
  outputFileTracingRoot: path.join(__dirname),
  /** Polling avoids “too many open files” (EMFILE) on some Macs when using `next dev`. */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 600,
        ignored: ["**/node_modules/**", "**/.git/**"],
      };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
