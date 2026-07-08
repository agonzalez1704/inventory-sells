import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// On the "store." subdomain we serve ONLY the public catalog (rewritten from
// /tienda). Any other path there falls back to the catalog — the staff app
// lives on the main domain. Assets, API and Clerk paths pass through.
export default clerkMiddleware(async (_auth, req) => {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (host.startsWith("store.")) {
    const p = req.nextUrl.pathname;
    const passthrough =
      p.startsWith("/_next") ||
      p.startsWith("/api") ||
      p.startsWith("/__clerk") ||
      p.includes(".");
    if (!passthrough) {
      const url = req.nextUrl.clone();
      url.pathname = "/tienda";
      return NextResponse.rewrite(url);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
