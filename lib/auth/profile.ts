import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Profile } from "@/lib/types";
import type { Permiso } from "@/lib/permissions";

// Page guard: redirect out unless the signed-in user's role grants `permiso`
// (admin_total passes everything). Server components only.
export async function requirePagePermiso(permiso: Permiso, to = "/"): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has(permiso)) redirect(to);
  return userId;
}

// Server-action guard: throws (not redirect) unless the user's role grants
// `permiso` (admin_total passes everything). Returns the user id.
export async function assertPermiso(permiso: Permiso): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has(permiso)) throw new Error("Sin permiso");
  return userId;
}

// Convenience for actions that need to branch on several permisos.
export async function permisosDe(): Promise<Set<Permiso>> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return getPermisos(userId);
}

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

// Users a quote can be assigned to: anyone whose role grants `cotizar` (i.e. can
// own and work a quote). Used by the quote builder + detail reassign.
export async function getAsignables(): Promise<{ id: string; nombre: string }[]> {
  const { data: rp } = await insforgeAdmin.database
    .from("role_permissions")
    .select("role_id")
    .eq("permiso", "cotizar");
  const roleIds = [...new Set(((rp ?? []) as { role_id: string }[]).map((r) => r.role_id))];
  if (roleIds.length === 0) return [];

  const { data: profs } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name")
    .in("role_id", roleIds);
  return ((profs ?? []) as { id: string; full_name: string | null }[])
    .map((p) => ({ id: p.id, nombre: p.full_name ?? "—" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Does a role grant admin_total? The legacy `role` text is kept in sync with
// this so `role = 'admin'` checks stay consistent with the permission model.
async function rolEsAdmin(roleId: string | null): Promise<boolean> {
  if (!roleId) return false;
  const { data } = await insforgeAdmin.database
    .from("role_permissions")
    .select("permiso")
    .eq("role_id", roleId)
    .eq("permiso", "admin_total")
    .maybeSingle();
  return Boolean(data);
}

// Ensure a profiles row exists for the given Clerk user. Role resolution:
//   1) a pending/accepted invite for this email → the admin-chosen role,
//   2) else the first user ever → Dueño, everyone after → Vendedor.
// Uses the admin client (bypasses RLS) — profiles are not client-writable.
export async function ensureProfile(
  userId: string,
  fullName?: string | null,
  email?: string | null,
): Promise<Profile> {
  const { data: existing, error } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "profile lookup failed");
  if (existing) return existing as Profile;

  // Invited role (by email) wins over the default.
  let roleSlug: string | null = null;
  let inviteEmail: string | null = null;
  const e = email?.trim().toLowerCase() || null;
  if (e) {
    const { data: inv } = await insforgeAdmin.database
      .from("user_invites")
      .select("role_slug, status")
      .eq("email", e)
      .maybeSingle();
    const row = inv as { role_slug: string; status: string } | null;
    if (row && row.status !== "revoked") {
      roleSlug = row.role_slug;
      inviteEmail = e;
    }
  }

  if (!roleSlug) {
    const { data: anyAdmin } = await insforgeAdmin.database
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    roleSlug = anyAdmin ? "vendedor" : "dueno";
  }

  const { data: r } = await insforgeAdmin.database
    .from("roles")
    .select("id")
    .eq("slug", roleSlug)
    .maybeSingle();
  const roleId = (r as { id: string } | null)?.id ?? null;
  const role: Profile["role"] = (await rolEsAdmin(roleId)) ? "admin" : "seller";

  const { data: created, error: insErr } = await insforgeAdmin.database
    .from("profiles")
    .insert([{ id: userId, full_name: fullName ?? null, role, role_id: roleId }])
    .select("id, full_name, role")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message ?? "profile create failed");

  // Mark the invite consumed (keep the row so the email stays allow-listed).
  if (inviteEmail) {
    await insforgeAdmin.database
      .from("user_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("email", inviteEmail);
  }

  return created as Profile;
}
