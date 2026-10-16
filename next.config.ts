import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep secrets and non-runtime files out of the serverless bundles.
  outputFileTracingExcludes: {
    "*": ["./.env*", "./.vercel/**", "./scripts/**", "./tests/**", "./prisma/marketplace-schema/**", "./db/**", "./*.md"],
  },
  images: {
    remotePatterns: [
      // Mock "Popular Skills" listings are hotlinked from Unsplash.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Product/business photos uploaded through src/lib/external/cloudinary.ts.
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
