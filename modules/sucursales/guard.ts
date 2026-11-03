import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { inventariosSoloConsulta } from "@/modules/inventory/solo-consulta";

// Physical-stock rule: an inventory linked to a sucursal is only sellable by
// someone checked in AT that sucursal today. Mirrors the geo gate's
// exemptions exactly — admins and staff with no branch assignment sell
// anything — so the two features can't disagree about who is gated.

/**
 * Inventory ids this user may NOT sell from right now, each mapped to where
 * the stock is (for the "está en Panorama" copy): another branch, or a
 * supplier's solo-consulta inventory, which nobody sells from — admins neither.
 */
export async function inventariosAjenos(userId: string): Promise<Map<string, string>> {
  const consulta = new Map(
    [...(await inventariosSoloConsulta())].map(([id, nombre]) => [id, `${nombre} · bajo pedido`] as const),
  );
  return new Map([...(await deSucursalAjena(userId)), ...consulta]);
}

/** Branch-linked inventories this user isn't checked in at, mapped to the branch. */
async function deSucursalAjena(userId: string): Promise<Map<string, string>> {
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

/** Throw (naming product and place) if any item can't be sold from here. */
export async function assertVentaPermitida(
  userId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const bloqueados = await inventariosAjenos(userId);
  if (bloqueados.size === 0) return;

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("name, inventory_id")
    .in("id", productIds);
  const rows = (data ?? []) as unknown as { name: string; inventory_id: string }[];
  const fuera = rows.find((r) => bloqueados.has(r.inventory_id));
  if (fuera) {
    throw new Error(`"${fuera.name}" está en ${bloqueados.get(fuera.inventory_id)}: no se vende desde aquí.`);
  }
}
