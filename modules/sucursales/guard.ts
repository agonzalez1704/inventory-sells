import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { mxHoy, rangoUTC } from "@/lib/caja-range";

// Physical-stock rule: an inventory linked to a sucursal is only sellable by
// someone checked in AT that sucursal today. Mirrors the geo gate's
// exemptions exactly — admins and staff with no branch assignment sell
// anything — so the two features can't disagree about who is gated.

/**
 * Inventory ids this user may NOT sell from right now, each mapped to the
 * branch it physically lives at (for the "está en Panorama" copy). Empty for
 * exempt users and for shops that never linked an inventory to a branch.
 */
export async function inventariosAjenos(userId: string): Promise<Map<string, string>> {
  const vacio = new Map<string, string>();

  const { data: invData } = await insforgeAdmin.database
    .from("inventories")
    .select("id, sucursal_id, sucursales(nombre)")
    .not("sucursal_id", "is", null);
  const ligados = ((invData ?? []) as unknown as {
    id: string;
    sucursal_id: string;
    sucursales: { nombre: string } | { nombre: string }[] | null;
  }[]).map((i) => ({
    ...i,
    nombreSucursal:
      (Array.isArray(i.sucursales) ? i.sucursales[0]?.nombre : i.sucursales?.nombre) ??
      "otra sucursal",
  }));
  if (ligados.length === 0) return vacio;

  const perms = await getPermisos(userId);
  if (perms.has("admin_total")) return vacio;
  const { data: asig } = await insforgeAdmin.database
    .from("profile_sucursales")
    .select("sucursal_id")
    .eq("profile_id", userId);
  if (!asig || asig.length === 0) return vacio;

  // Today's check-in decides where they physically are. Gated but not checked
  // in: fail closed on every branch-linked inventory — the gate overlay should
  // have stopped them anyway.
  const { startISO, endISO } = rangoUTC(mxHoy(), mxHoy());
  const { data: hoy } = await insforgeAdmin.database
    .from("checkins")
    .select("sucursal_id")
    .eq("profile_id", userId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .limit(1);
  const aqui = ((hoy ?? []) as { sucursal_id: string }[])[0]?.sucursal_id ?? null;

  return new Map(
    ligados.filter((i) => i.sucursal_id !== aqui).map((i) => [i.id, i.nombreSucursal]),
  );
}

/** Set view of inventariosAjenos, for callers that only need membership. */
export async function inventariosBloqueados(userId: string): Promise<Set<string>> {
  return new Set((await inventariosAjenos(userId)).keys());
}

/** Throw (naming product and branch) if any item lives at another sucursal. */
export async function assertVentaPermitida(
  userId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const bloqueados = await inventariosBloqueados(userId);
  if (bloqueados.size === 0) return;

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("name, inventory_id, inventories(name, sucursales(nombre))")
    .in("id", productIds);
  const rows = (data ?? []) as unknown as {
    name: string;
    inventory_id: string;
    inventories: { name: string; sucursales: { nombre: string } | { nombre: string }[] | null } | null;
  }[];
  const fuera = rows.find((r) => bloqueados.has(r.inventory_id));
  if (fuera) {
    const suc = fuera.inventories?.sucursales;
    const nombreSuc = (Array.isArray(suc) ? suc[0]?.nombre : suc?.nombre) ?? "otra sucursal";
    throw new Error(
      `"${fuera.name}" está físicamente en la sucursal ${nombreSuc} — solo se vende desde ahí.`,
    );
  }
}
