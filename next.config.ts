import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Baked into the client bundle at build time so a loaded tab knows which
  // build it came from. Compared against /api/health to spot a new deploy —
  // otherwise the tab keeps calling Server Action ids that no longer exist.
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  },
  // Product photos live in InsForge storage and were being served straight from
  // there by <img>, at full size. Two things made that expensive: the objects
  // are 900x1200 (~370 kB) and painted as ~150 px thumbnails, and the origin
  // answers with a 302 to a SIGNED cdn URL whose Expires changes every single
  // request — a brand-new URL each time, so no browser cache can ever hit it.
  // Measured 5.99 GB of egress in one billing period against a 37 MB bucket.
  //
  // Routing them through the optimiser fixes both: Vercel keys its cache on the
  // stored URL (stable — it carries a content hash in ?v=), fetches the origin
  // once per variant, and hands out a resized WebP.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.us-east.insforge.app", pathname: "/api/storage/**" },
      { protocol: "https", hostname: "cdn.insforge.dev", pathname: "/storage/**" },
    ],
    // The URL changes whenever the photo does, so a cached variant can never be
    // stale. Vercel's default is 60 s, which would re-fetch the origin all day.
    minimumCacheTTL: 31536000,
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
