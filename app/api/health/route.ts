import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public build marker. Without it there's no way to tell whether a bug report
// is against the code we just shipped or the previous deploy. Exposes only the
// commit sha + region — no secrets.
//
// `config` reports WHICH integrations have their env wired, as booleans only —
// never names of values, never the values. Misconfigured env has broken
// production twice (SKYDROPX_ZIP_FROM, then the Skydropx keys) and there was no
// way to see it from outside; a boolean saying "skydropx: false" is worth far
// more than the near-zero it tells an attacker, who can already see Conekta on
// the checkout page.
export function GET() {
  return NextResponse.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    config: {
      conekta: Boolean(
        process.env.CONEKTA_PRIVATE_KEY &&
          process.env.NEXT_PUBLIC_CONEKTA_PUBLIC_KEY &&
          process.env.CONEKTA_WEBHOOK_SECRET,
      ),
      skydropx: Boolean(
        process.env.SKYDROPX_API_KEY && process.env.SKYDROPX_SECRET_KEY,
      ),
      // Split so a half-configured pair is obvious rather than silently false.
      skydropxKey: Boolean(process.env.SKYDROPX_API_KEY),
      skydropxSecret: Boolean(process.env.SKYDROPX_SECRET_KEY),
      push: Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
      ),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      whatsapp: Boolean(process.env.KAPSO_API_KEY),
    },
  });
}
