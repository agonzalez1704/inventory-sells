import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { tienePermiso } from "@/lib/auth/profile";
import { listarSucursales, asignacionesSucursales } from "@/modules/sucursales/actions";
import {
  UsuariosView,
  type RolRow,
  type UsuarioRow,
  type InviteRow,
} from "@/modules/usuarios/UsuariosView";


export default async function UsuariosPage() {
  const { userId } = await auth();
  if (!userId || !(await tienePermiso(userId, "usuarios_gestionar"))) redirect("/");

  const [{ data: rolesData }, { data: usersData }, { data: invitesData }] = await Promise.all([
    insforgeAdmin.database
      .from("roles")
      .select("id, slug, name, description, is_system, role_permissions(permiso)")
      .order("is_system", { ascending: false })
      .order("name", { ascending: true }),
    insforgeAdmin.database
      .from("profiles")
      .select("id, full_name, role_id, roles(name)")
      .order("created_at", { ascending: true }),
    insforgeAdmin.database
      .from("user_invites")
      .select("email, role_slug, status, created_at")
      .neq("status", "revoked")
      .order("created_at", { ascending: false }),
  ]);

  const slugToName = new Map(
    ((rolesData ?? []) as { slug: string; name: string }[]).map((r) => [r.slug, r.name]),
  );
  const invitaciones = ((invitesData ?? []) as {
    email: string;
    role_slug: string;
    status: string;
    created_at: string;
  }[]).map(
    (i): InviteRow => ({
      email: i.email,
      roleName: slugToName.get(i.role_slug) ?? i.role_slug,
      status: i.status,
      created_at: i.created_at,
    }),
  );

  const usuarios = ((usersData ?? []) as unknown as {
    id: string;
    full_name: string | null;
    role_id: string | null;
    roles: { name: string } | null;
  }[]).map(
    (u): UsuarioRow => ({
      id: u.id,
      full_name: u.full_name,
      role_id: u.role_id,
      roleName: u.roles?.name ?? null,
    }),
  );

  const usersPorRol = new Map<string, number>();
  for (const u of usuarios) if (u.role_id) usersPorRol.set(u.role_id, (usersPorRol.get(u.role_id) ?? 0) + 1);

  const roles = ((rolesData ?? []) as {
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    role_permissions: { permiso: string }[];
  }[]).map(
    (r): RolRow => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_system: r.is_system,
      permisos: (r.role_permissions ?? []).map((p) => p.permiso),
      userCount: usersPorRol.get(r.id) ?? 0,
    }),
  );

  const [sucursales, asignaciones] = await Promise.all([
    listarSucursales(),
    asignacionesSucursales(),
  ]);

  return (
    <UsuariosView
      usuarios={usuarios}
      roles={roles}
      invitaciones={invitaciones}
      sucursales={sucursales}
      asignaciones={asignaciones}
    />
  );
}
