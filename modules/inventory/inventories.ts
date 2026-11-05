"use server";

import { updateTag } from "next/cache";

import { assertPermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Inventory } from "@/lib/types";
import { attempt, type ActionResult } from "@/lib/errors";

export async function createInventory(name: string): Promise<Inventory> {
  // The permission, not the legacy role text. The shop renamed a seller's role
  // and granted it inventario_gestionar; the UI (which reads permisos) showed
  // the button while this check (which read profile.role) refused the click —
  // two authorization systems disagreeing about the same person. The permiso
  // is the one the roles screen edits, so it is the one that decides.
  await assertPermiso("inventario_gestionar");

  const clean = name.trim();
  if (!clean) throw new Error("El nombre es obligatorio");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("inventories")
    .insert([{ name: clean }])
    .select("id, name")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Error al crear el inventario");
  return data as Inventory;
}

/**
 * Edit the inventory itself: its name, its city, its delivery lead.
 *
 * Until now this took SQL — the Irapuato warehouse got its 2 días by hand.
 * Same gate as creating one. The tag matters: the storefront shows each
 * variant's extra days from its cached listing, so changing the lead here has
 * to reach the next visitor, not the next TTL.
 */
export async function editarInventario(
  id: string,
  campos: {
    nombre: string;
    ciudad: string | null;
    entregaDias: number | null;
    esDropship?: boolean;
    sucursalId?: string | null;
    soloConsulta?: boolean;
  },
): Promise<void> {
  await assertPermiso("inventario_gestionar");

  const nombre = campos.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio");
  if (campos.entregaDias != null && (!Number.isInteger(campos.entregaDias) || campos.entregaDias < 0))
    throw new Error("Los días de entrega deben ser un entero positivo");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("inventories")
    .update({
      name: nombre,
      ciudad: campos.ciudad?.trim() || null,
      entrega_dias_habiles: campos.entregaDias,
      es_dropship: campos.esDropship ?? false,
      sucursal_id: campos.sucursalId ?? null,
      solo_consulta: campos.soloConsulta ?? false,
    })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo guardar el inventario");
  updateTag("tienda");
}

/**
 * Delete an inventory and every product in it — for a load that went wrong
 * (a CEDIS imported twice). Parts with history (sales, purchases, quotes,
 * transfers…) are kept by their foreign keys: the products DELETE is one
 * statement, so one such part fails it whole and nothing is deleted.
 * Their movements, photos, tags and cost layers go with them (cascade).
 */
export async function eliminarInventario(
  id: string,
): Promise<ActionResult<{ productos: number }>> {
  return attempt("eliminarInventario", async () => {
    await assertPermiso("admin_total");
    const DB = insforgeAdmin.database;

    const { count } = await DB.from("products")
      .select("id", { count: "exact", head: true })
      .eq("inventory_id", id);
    const del = await DB.from("products").delete().eq("inventory_id", id);
    if (del.error) {
      throw new Error(
        /foreign key|violates/i.test(del.error.message ?? "")
          ? "Tiene piezas con ventas, compras, cotizaciones o traspasos: no se puede eliminar. No se borró nada."
          : (del.error.message ?? "No se pudo eliminar"),
      );
    }
    await DB.from("import_batches").delete().eq("inventory_id", id);
    const { error } = await DB.from("inventories").delete().eq("id", id);
    if (error)
      throw new Error(error.message ?? "No se pudo eliminar el inventario");
    updateTag("tienda");
    return { productos: count ?? 0 };
  });
}

/** One brand for every product of an inventory (all of CEDIS is Grob). */
export async function marcaParaInventario(
  id: string,
  marca: string,
): Promise<ActionResult> {
  return attempt("marcaParaInventario", async () => {
    await assertPermiso("inventario_gestionar");
    const limpia = marca.trim();
    if (!limpia) throw new Error("Escribe la marca");
    const { error } = await insforgeAdmin.database
      .from("products")
      .update({ brand: limpia })
      .eq("inventory_id", id);
    if (error) throw new Error(error.message ?? "No se pudo poner la marca");
    updateTag("tienda");
    return null;
  });
}
