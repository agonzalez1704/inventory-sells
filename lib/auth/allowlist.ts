import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

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

// Access = the env bootstrap list OR a non-revoked invite. So an admin can grant
// a new seller access by inviting them, no redeploy needed.
export async function emailTieneAcceso(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (allowedSet().has(e)) return true;
  const { data } = await insforgeAdmin.database
    .from("user_invites")
    .select("status")
    .eq("email", e)
    .maybeSingle();
  const inv = data as { status: string } | null;
  return Boolean(inv && inv.status !== "revoked");
}
