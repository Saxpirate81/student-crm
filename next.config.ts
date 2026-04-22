import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Lockfile in your home folder can make Next.js pick the wrong app root.
   * Pin tracing to this project folder (the `web` directory).
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
