import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Profile } from "@/lib/types";

// Read a profile by Clerk user id (null if none yet). Admin client → no RLS.
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

// Ensure a profiles row exists for the given Clerk user. The first user to sign
// in (when no admin exists yet) becomes 'admin'; everyone after is 'seller'.
// Uses the admin client (bypasses RLS) — profiles are not client-writable.
export async function ensureProfile(
  userId: string,
  fullName?: string | null,
): Promise<Profile> {
  const { data: existing, error } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "profile lookup failed");
  if (existing) return existing as Profile;

  const { data: anyAdmin } = await insforgeAdmin.database
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  const role: Profile["role"] = anyAdmin ? "seller" : "admin";

  const { data: created, error: insErr } = await insforgeAdmin.database
    .from("profiles")
    .insert([{ id: userId, full_name: fullName ?? null, role }])
    .select("id, full_name, role")
    .maybeSingle();

  if (insErr) throw new Error(insErr.message ?? "profile create failed");
  return created as Profile;
}
