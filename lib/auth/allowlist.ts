import "server-only";

// Only the emails in ALLOWED_EMAILS (comma-separated) may use Fiable. There is
// no hardcoded list — set the env in every environment (.env.local + Vercel).
// Fails closed: if the env is missing or empty, nobody passes. The Clerk
// Dashboard allowlist (Configure → Restrictions) remains the authoritative
// sign-in block.
function allowedSet(): Set<string> {
  const env = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    env
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedSet().has(email.trim().toLowerCase());
}
