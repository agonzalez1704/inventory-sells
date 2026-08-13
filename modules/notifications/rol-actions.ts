"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import type { NotifKind } from "@/lib/push";

export type NotifRol = { role_id: string; rol: string; kinds: NotifKind[] };

/** The whole matrix — every role, and which events reach it. */
export async function notificacionesPorRol(): Promise<NotifRol[]> {
  const { data } = await insforgeAdmin.database.rpc("notificaciones_por_rol");
  return ((data ?? []) as NotifRol[]).map((r) => ({ ...r, kinds: r.kinds ?? [] }));
}

/**
 * Turn one event on or off for one role.
 *
 * One cell at a time, not the whole matrix: two admins editing different roles
 * would otherwise overwrite each other with whatever their screen was showing
 * when it loaded.
 */
export async function setNotifRol(
  roleId: string,
  kind: NotifKind,
  activo: boolean,
): Promise<ActionResult<null>> {
  return attempt("setNotifRol", async () => {
    // Deciding who gets told what is managing staff, so it rides the permission
    // that already means that — and the RLS policy demands the same one.
    await assertPermiso("usuarios_gestionar");
    const db = insforgeAdmin.database;
    if (activo) {
      const { error } = await db
        .from("role_notification_prefs")
        .insert([{ role_id: roleId, kind }]);
      // Already on: two people ticking the same box is not a failure.
      if (error && !String(error.message ?? "").includes("duplicate")) {
        throw new Error(error.message ?? "No se pudo guardar");
      }
    } else {
      const { error } = await db
        .from("role_notification_prefs")
        .delete()
        .eq("role_id", roleId)
        .eq("kind", kind);
      if (error) throw new Error(error.message ?? "No se pudo guardar");
    }
    return null;
  });
}
