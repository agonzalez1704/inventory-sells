"use server";

import { updateTag } from "next/cache";

import { assertPermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { Inventory } from "@/lib/types";

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
  campos: { nombre: string; ciudad: string | null; entregaDias: number | null; esDropship?: boolean },
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
    })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo guardar el inventario");
  updateTag("tienda");
}
