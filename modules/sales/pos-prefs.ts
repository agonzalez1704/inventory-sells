"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { permisosDe } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";

export type PrecioBase = "venta" | "costo";

/**
 * Whether THIS user's register shows the sale price or the cost.
 *
 * Falls back to 'venta' for anyone who never chose, and for anyone who may not
 * see costs — a permission taken away has to take the setting with it, or the
 * row keeps showing cost to someone who no longer qualifies.
 */
export async function getPrecioBasePos(): Promise<PrecioBase> {
  const { userId } = await auth();
  if (!userId) return "venta";

  const perms = await permisosDe();
  if (!(perms.has("admin_total") || perms.has("costos_ver"))) return "venta";

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("pos_prefs")
    .select("precio_base")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { precio_base?: string } | null)?.precio_base === "costo"
    ? "costo"
    : "venta";
}

export async function setPrecioBasePos(base: PrecioBase): Promise<ActionResult<null>> {
  return attempt("setPrecioBasePos", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    // RLS keeps this row private to its owner but says nothing about who may
    // put 'costo' in it. That is this check.
    const perms = await permisosDe();
    if (base === "costo" && !(perms.has("admin_total") || perms.has("costos_ver"))) {
      throw new Error("No tienes permiso para ver costos");
    }

    const insforge = await createInsForgeServerClient();
    // Delete-then-insert, like notification_prefs: the SDK has no upsert and
    // the row is one column, so there is nothing to lose by replacing it.
    await insforge.database.from("pos_prefs").delete().eq("user_id", userId);
    const { error } = await insforge.database
      .from("pos_prefs")
      .insert([{ user_id: userId, precio_base: base }]);
    if (error) throw new Error(error.message ?? "No se pudo guardar");
    return null;
  });
}
