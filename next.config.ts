import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    const privateAppHeaders = [
      {
        key: "Cache-Control",
        value: "no-store",
      },
    ];

    return [
      {
        source: "/app",
        headers: privateAppHeaders,
      },
      {
        source: "/app/:path*",
        headers: privateAppHeaders,
      },
    ];
  },
};

export default nextConfig;
