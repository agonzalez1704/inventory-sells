"use server";

import { auth } from "@clerk/nextjs/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { tienePermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { PERMISOS, type Permiso } from "@/lib/permissions";

async function requireGestionUsuarios(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (!(await tienePermiso(userId, "usuarios_gestionar")))
    throw new Error("Sin permiso para gestionar usuarios");
}

const limpiaPermisos = (p: string[]): Permiso[] =>
  [...new Set(p)].filter((x): x is Permiso => (PERMISOS as readonly string[]).includes(x));

// role text is kept aligned with admin-ness so legacy `role = 'admin'` checks
// stay consistent with the permission-driven is_admin().
async function esRolAdmin(roleId: string): Promise<boolean> {
  const { data } = await insforgeAdmin.database
    .from("role_permissions")
    .select("permiso")
    .eq("role_id", roleId)
    .eq("permiso", "admin_total")
    .maybeSingle();
  return Boolean(data);
}

export async function cambiarRolUsuario(
  userId: string,
  roleId: string,
): Promise<ActionResult<null>> {
  return attempt("cambiarRolUsuario", async () => {
    await requireGestionUsuarios();
    const role = (await esRolAdmin(roleId)) ? "admin" : "seller";
    const { error } = await insforgeAdmin.database
      .from("profiles")
      .update({ role_id: roleId, role })
      .eq("id", userId);
    if (error) throw new Error(error.message ?? "No se pudo cambiar el rol");
    return null;
  });
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  // A short suffix keeps two roles named the same from colliding on the slug.
  return `${base || "rol"}-${Math.abs(hash(name + base)).toString(36).slice(0, 4)}`;
}
// Deterministic (no Math.random in a server action path that could retry).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function crearRol(
  name: string,
  descripcion: string,
  permisos: string[],
): Promise<ActionResult<{ id: string }>> {
  return attempt("crearRol", async () => {
    await requireGestionUsuarios();
    const nombre = name.trim();
    if (nombre.length < 2) throw new Error("El nombre del rol es muy corto");
    const { data, error } = await insforgeAdmin.database
      .from("roles")
      .insert([{ slug: slugify(nombre), name: nombre, description: descripcion.trim() || null, is_system: false }])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message ?? "No se pudo crear el rol");
    const roleId = (data as { id: string } | null)?.id;
    if (!roleId) throw new Error("No se pudo crear el rol");

    const clean = limpiaPermisos(permisos);
    if (clean.length) {
      await insforgeAdmin.database
        .from("role_permissions")
        .insert(clean.map((permiso) => ({ role_id: roleId, permiso })));
    }
    return { id: roleId };
  });
}

export async function actualizarRol(
  roleId: string,
  name: string,
  descripcion: string,
  permisos: string[],
): Promise<ActionResult<null>> {
  return attempt("actualizarRol", async () => {
    await requireGestionUsuarios();
    const nombre = name.trim();
    if (nombre.length < 2) throw new Error("El nombre del rol es muy corto");

    const { error: upErr } = await insforgeAdmin.database
      .from("roles")
      .update({ name: nombre, description: descripcion.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", roleId);
    if (upErr) throw new Error(upErr.message ?? "No se pudo actualizar el rol");

    // Replace the permission set.
    await insforgeAdmin.database.from("role_permissions").delete().eq("role_id", roleId);
    const clean = limpiaPermisos(permisos);
    if (clean.length) {
      await insforgeAdmin.database
        .from("role_permissions")
        .insert(clean.map((permiso) => ({ role_id: roleId, permiso })));
    }
    return null;
  });
}

export async function eliminarRol(roleId: string): Promise<ActionResult<null>> {
  return attempt("eliminarRol", async () => {
    await requireGestionUsuarios();

    const { data: role } = await insforgeAdmin.database
      .from("roles")
      .select("is_system")
      .eq("id", roleId)
      .maybeSingle();
    if ((role as { is_system: boolean } | null)?.is_system)
      throw new Error("No se puede eliminar un rol del sistema");

    const { data: enUso } = await insforgeAdmin.database
      .from("profiles")
      .select("id")
      .eq("role_id", roleId)
      .limit(1)
      .maybeSingle();
    if (enUso) throw new Error("Hay usuarios con este rol. Reasígnalos primero.");

    const { error } = await insforgeAdmin.database.from("roles").delete().eq("id", roleId);
    if (error) throw new Error(error.message ?? "No se pudo eliminar el rol");
    return null;
  });
}
