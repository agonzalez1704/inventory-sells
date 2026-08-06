"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { toCents } from "@/lib/money";

export type GarantiaEstado = "pendiente" | "aplicada" | "rechazada";

export type Garantia = {
  id: string;
  proveedor_id: string;
  product_id: string | null;
  descripcion: string;
  qty: number;
  monto_cents: number;
  fecha: string;
  estado: GarantiaEstado;
  resolucion: string | null;
  notas: string | null;
  proveedores?: { nombre: string } | null;
};

export type GarantiaSaldo = {
  proveedor_id: string;
  nombre: string;
  pendiente_cents: number;
  pendientes: number;
  aplicadas: number;
};

const COLS =
  "id, proveedor_id, product_id, descripcion, qty, monto_cents, fecha, estado, resolucion, notas";

export async function listarGarantias(): Promise<Garantia[]> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("garantias_proveedor")
    .select(`${COLS}, proveedores(nombre)`)
    .order("fecha", { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as Garantia[];
}

// Only suppliers that actually owe us something — the number the business asked
// for ("nos debe este adeudo de garantías").
export async function saldosGarantias(): Promise<GarantiaSaldo[]> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("garantias_saldo")
    .select("proveedor_id, nombre, pendiente_cents, pendientes, aplicadas");
  return ((data ?? []) as unknown as GarantiaSaldo[])
    .map((s) => ({ ...s, pendiente_cents: Number(s.pendiente_cents ?? 0) }))
    .filter((s) => s.pendientes > 0)
    .sort((a, b) => b.pendiente_cents - a.pendiente_cents);
}

export async function crearGarantia(input: {
  proveedor_id: string;
  product_id: string | null;
  descripcion: string;
  qty: number;
  montoPesos: number;
  fecha: string;
  notas: string | null;
}): Promise<ActionResult<null>> {
  return attempt("crearGarantia", async () => {
  const userId = await assertPermiso("inventario_gestionar");
  const descripcion = input.descripcion.trim();
  if (!descripcion) throw new Error("Describe la pieza que se regresa");
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) throw new Error("Cantidad inválida");

  const { error } = await insforgeAdmin.database.from("garantias_proveedor").insert([
    {
      proveedor_id: input.proveedor_id,
      product_id: input.product_id || null,
      descripcion,
      qty,
      monto_cents: Math.max(0, toCents(input.montoPesos || 0)),
      fecha: input.fecha,
      notas: input.notas?.trim() || null,
      created_by: userId,
    },
  ]);
  if (error) throw new Error(error.message ?? "No se pudo registrar la garantía");
  return null;
  });
}

// Closing one: the supplier credited it, replaced the part, or refused it.
export async function resolverGarantia(
  id: string,
  estado: Exclude<GarantiaEstado, "pendiente">,
  resolucion: string | null,
): Promise<ActionResult<null>> {
  return attempt("resolverGarantia", async () => {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("garantias_proveedor")
    .update({
      estado,
      resolucion: resolucion?.trim() || null,
      resuelta_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo actualizar");
  return null;
  });
}

export async function reabrirGarantia(id: string): Promise<ActionResult<null>> {
  return attempt("reabrirGarantia", async () => {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("garantias_proveedor")
    .update({ estado: "pendiente", resolucion: null, resuelta_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo reabrir");
  return null;
  });
}

export async function borrarGarantia(id: string): Promise<ActionResult<null>> {
  return attempt("borrarGarantia", async () => {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("garantias_proveedor")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo borrar");
  return null;
  });
}
