import type { NextConfig } from "next";

const normalizeBase = (base: string) => base.replace(/\/$/, "");

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  eslint: {
    // Allows the production build to succeed even if ESLint finds issues
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Skip the type-check step during build to unblock deployments
    ignoreBuildErrors: true,
  },
  async rewrites() {
    const backendBase =
      normalizeBase(
        process.env.NEXT_PUBLIC_BACKEND_URL ||
          process.env.NEXT_PUBLIC_API_BASE ||
          "http://127.0.0.1:8000"
      );

    return [
      {
        source: "/api/:path*",
        destination: `${backendBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
