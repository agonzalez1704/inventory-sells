import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { tienePermiso } from "@/lib/auth/profile";
import {
  UsuariosView,
  type RolRow,
  type UsuarioRow,
} from "@/modules/usuarios/UsuariosView";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const { userId } = await auth();
  if (!userId || !(await tienePermiso(userId, "usuarios_gestionar"))) redirect("/");

  const [{ data: rolesData }, { data: usersData }] = await Promise.all([
    insforgeAdmin.database
      .from("roles")
      .select("id, name, description, is_system, role_permissions(permiso)")
      .order("is_system", { ascending: false })
      .order("name", { ascending: true }),
    insforgeAdmin.database
      .from("profiles")
      .select("id, full_name, role_id, roles(name)")
      .order("created_at", { ascending: true }),
  ]);

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

  return <UsuariosView usuarios={usuarios} roles={roles} />;
}
