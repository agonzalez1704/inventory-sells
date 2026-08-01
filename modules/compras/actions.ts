"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso } from "@/lib/auth/profile";
import { toCents } from "@/lib/money";

export type CompraEstado = "borrador" | "recibida" | "cancelada";
export type Condicion = "contado" | "credito";

export type CompraItem = {
  id: string;
  product_id: string;
  qty: number;
  costo_unitario_cents: number;
  line_total_cents: number;
  products?: { sku: string; name: string } | null;
};

export type Compra = {
  id: string;
  proveedor_id: string;
  folio_factura: string | null;
  fecha_ingreso: string;
  condicion: Condicion;
  dias_credito: number;
  vence_el: string;
  pronto_pago: boolean;
  pronto_pago_pct: number | null;
  pronto_pago_dias: number | null;
  total_factura_cents: number;
  estado: CompraEstado;
  notas: string | null;
  created_at: string;
  proveedores?: { nombre: string } | null;
  compra_items?: CompraItem[];
};

const COLS =
  "id, proveedor_id, folio_factura, fecha_ingreso, condicion, dias_credito, vence_el, " +
  "pronto_pago, pronto_pago_pct, pronto_pago_dias, total_factura_cents, estado, notas, created_at";

export async function listarCompras(): Promise<Compra[]> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("compras")
    .select(`${COLS}, proveedores(nombre), compra_items(qty, line_total_cents)`)
    .order("fecha_ingreso", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as Compra[];
}

export async function getCompra(id: string): Promise<Compra | null> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("compras")
    .select(
      `${COLS}, proveedores(nombre), ` +
        "compra_items(id, product_id, qty, costo_unitario_cents, line_total_cents, products(sku, name))",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Compra) ?? null;
}

export type CompraInput = {
  proveedor_id: string;
  folio_factura: string | null;
  fecha_ingreso: string; // yyyy-mm-dd
  condicion: Condicion;
  dias_credito: number;
  pronto_pago: boolean;
  pronto_pago_pct: number | null;
  pronto_pago_dias: number | null;
  total_factura: number; // pesos, lo que dice el papel
  notas: string | null;
};

function clean(input: CompraInput) {
  if (!input.proveedor_id) throw new Error("Elige el proveedor");
  const dias = Math.max(0, Math.round(Number(input.dias_credito) || 0));
  if (dias > 365) throw new Error("Días de crédito fuera de rango");
  const pct = input.pronto_pago ? Number(input.pronto_pago_pct) : null;
  if (input.pronto_pago && (!Number.isFinite(pct!) || pct! <= 0 || pct! > 100))
    throw new Error("Descuento de pronto pago inválido (1 a 100)");
  return {
    proveedor_id: input.proveedor_id,
    folio_factura: input.folio_factura?.trim() || null,
    fecha_ingreso: input.fecha_ingreso,
    condicion: input.condicion,
    dias_credito: input.condicion === "credito" ? dias : 0,
    pronto_pago: input.pronto_pago,
    pronto_pago_pct: input.pronto_pago ? pct : null,
    pronto_pago_dias: input.pronto_pago
      ? Math.max(1, Math.round(Number(input.pronto_pago_dias) || 1))
      : null,
    total_factura_cents: Math.max(0, toCents(input.total_factura || 0)),
    notas: input.notas?.trim() || null,
  };
}

export async function crearCompra(input: CompraInput): Promise<{ id: string }> {
  const userId = await assertPermiso("inventario_gestionar");
  const { data, error } = await insforgeAdmin.database
    .from("compras")
    .insert([{ ...clean(input), created_by: userId }])
    .select("id")
    .single();
  if (error || !data) {
    if (/duplicate|unique/i.test(error?.message ?? ""))
      throw new Error("Ya registraste esa factura para este proveedor");
    throw new Error(error?.message ?? "Error al crear la compra");
  }
  return { id: (data as { id: string }).id };
}

async function assertBorrador(compraId: string) {
  const { data } = await insforgeAdmin.database
    .from("compras")
    .select("estado")
    .eq("id", compraId)
    .maybeSingle();
  const estado = (data as { estado: CompraEstado } | null)?.estado;
  if (!estado) throw new Error("Compra no encontrada");
  if (estado !== "borrador")
    throw new Error(`La compra ya fue ${estado}; solo un borrador se puede editar`);
}

export async function editarCompra(id: string, input: CompraInput): Promise<void> {
  await assertPermiso("inventario_gestionar");
  await assertBorrador(id);
  const { error } = await insforgeAdmin.database
    .from("compras")
    .update(clean(input))
    .eq("id", id);
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? ""))
      throw new Error("Ya registraste esa factura para este proveedor");
    throw new Error(error.message ?? "Error al guardar");
  }
}

// qty is the TOTAL wanted for that product — one line per product per invoice.
export async function ponerItem(
  compraId: string,
  productId: string,
  qty: number,
  costoPesos: number,
): Promise<void> {
  await assertPermiso("inventario_gestionar");
  await assertBorrador(compraId);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Cantidad inválida");
  const costo = Math.max(0, toCents(costoPesos || 0));

  await insforgeAdmin.database
    .from("compra_items")
    .delete()
    .eq("compra_id", compraId)
    .eq("product_id", productId);
  const { error } = await insforgeAdmin.database
    .from("compra_items")
    .insert([{ compra_id: compraId, product_id: productId, qty, costo_unitario_cents: costo }]);
  if (error) throw new Error(error.message ?? "Error al agregar el producto");
}

export async function quitarItem(compraId: string, itemId: string): Promise<void> {
  await assertPermiso("inventario_gestionar");
  await assertBorrador(compraId);
  const { error } = await insforgeAdmin.database
    .from("compra_items")
    .delete()
    .eq("id", itemId)
    .eq("compra_id", compraId);
  if (error) throw new Error(error.message ?? "Error al quitar el producto");
}

// Receiving moves stock, so it goes through the RPC on the USER-scoped client:
// the ledger records who received the goods.
export async function recibirCompra(id: string): Promise<{ piezas: number; total_cents: number }> {
  await assertPermiso("inventario_gestionar");
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("confirmar_compra", { p_id: id });
  if (error) throw new Error(error.message ?? "No se pudo recibir la compra");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { piezas: number; total_cents: number }
    | undefined;
  return { piezas: Number(row?.piezas ?? 0), total_cents: Number(row?.total_cents ?? 0) };
}

export async function cancelarCompra(id: string): Promise<void> {
  await assertPermiso("inventario_gestionar");
  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("cancelar_compra", { p_id: id });
  if (error) {
    // The products CHECK is what refuses to invent negative stock.
    if (/quantity_check|violates/i.test(error.message ?? ""))
      throw new Error(
        "No se puede cancelar: parte de esa mercancía ya salió del inventario. Ajusta el stock primero.",
      );
    throw new Error(error.message ?? "No se pudo cancelar la compra");
  }
}
