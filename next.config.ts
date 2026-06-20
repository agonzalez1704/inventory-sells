import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin tracing root to this project; a stray parent lockfile confuses inference.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Inventory photos / PDFs are uploaded to Server Actions; default is 1MB.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
