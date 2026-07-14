import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public build marker. Without it there's no way to tell whether a bug report
// is against the code we just shipped or the previous deploy. Exposes only the
// commit sha + region — no secrets.
export function GET() {
  return NextResponse.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "development",
  });
}
