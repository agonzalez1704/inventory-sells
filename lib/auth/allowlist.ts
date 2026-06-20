import "server-only";

// Only these emails may use Fiable. Override/extend via the ALLOWED_EMAILS env
// (comma-separated). This is enforced in-app; the authoritative block is the
// Clerk Dashboard allowlist (Configure → Restrictions), which prevents anyone
// else from creating a session at all.
const DEFAULT_ALLOWED = [
  "agonzalez.nrn02@gmail.com",
  "freseromayor@icloud.com",
  "tiendasmovilhouse@gmail.com",
];

function allowedSet(): Set<string> {
  const env = process.env.ALLOWED_EMAILS;
  const list = env ? env.split(",") : DEFAULT_ALLOWED;
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedSet().has(email.trim().toLowerCase());
}
