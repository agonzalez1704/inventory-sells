import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Baked into the client bundle at build time so a loaded tab knows which
  // build it came from. Compared against /api/health to spot a new deploy —
  // otherwise the tab keeps calling Server Action ids that no longer exist.
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  },
  // Pin tracing root to this project; a stray parent lockfile confuses inference.
  outputFileTracingRoot: process.cwd(),
  // Keep the PDF renderer out of the bundler; it ships its own fonts/binaries.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // Inventory photos / PDFs are uploaded to Server Actions; default is 1MB.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
