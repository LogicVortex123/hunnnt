import type { NextConfig } from "next";

const API_URL = process.env.OPPORTUNITYOS_API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Browser calls /api/v1/* on the dashboard origin; Next proxies to the loopback-only API.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
