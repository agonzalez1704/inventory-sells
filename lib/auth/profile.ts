import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Profile } from "@/lib/types";
import type { Permiso } from "@/lib/permissions";

// Read a profile by Clerk user id (null if none yet). Admin client → no RLS.
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

// The permission set granted by a user's role. Features gate on this instead of
// the legacy role text so custom roles work. Empty set for a user with no role.
export async function getPermisos(userId: string): Promise<Set<Permiso>> {
  const { data } = await insforgeAdmin.database
    .from("profiles")
    .select("role_id, roles(role_permissions(permiso))")
    .eq("id", userId)
    .maybeSingle();
  const row = data as
    | { role_id: string | null; roles: { role_permissions: { permiso: string }[] } | null }
    | null;
  const perms = row?.roles?.role_permissions ?? [];
  return new Set(perms.map((p) => p.permiso as Permiso));
}

export async function tienePermiso(userId: string, permiso: Permiso): Promise<boolean> {
  return (await getPermisos(userId)).has(permiso);
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

  // First user ever → Dueño (admin); everyone after → Vendedor. role text stays
  // in sync with role_id for the built-in roles so legacy `role` checks hold.
  const esPrimero = !anyAdmin;
  const roleSlug = esPrimero ? "dueno" : "vendedor";
  const role: Profile["role"] = esPrimero ? "admin" : "seller";
  const { data: r } = await insforgeAdmin.database
    .from("roles")
    .select("id")
    .eq("slug", roleSlug)
    .maybeSingle();
  const roleId = (r as { id: string } | null)?.id ?? null;

  const { data: created, error: insErr } = await insforgeAdmin.database
    .from("profiles")
    .insert([{ id: userId, full_name: fullName ?? null, role, role_id: roleId }])
    .select("id, full_name, role")
    .maybeSingle();

  if (insErr) throw new Error(insErr.message ?? "profile create failed");
  return created as Profile;
}
