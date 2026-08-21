"use server";

import { slugify } from "@/lib/slug";

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

// ---- Parte 2: notas de crédito, pagos y saldo ----

export type NotaTipo = "no_llego" | "devolucion" | "descuento";
export type MetodoPago = "transferencia" | "cheque" | "efectivo";

export type NotaCredito = {
  id: string;
  tipo: NotaTipo;
  monto_cents: number;
  motivo: string | null;
  fecha: string;
  compra_nota_items?: {
    id: string;
    qty: number;
    costo_unitario_cents: number;
    line_total_cents: number;
    products?: { sku: string; name: string } | null;
  }[];
};

export type Pago = {
  id: string;
  monto_cents: number;
  metodo: MetodoPago;
  fecha: string;
  referencia: string | null;
  notas: string | null;
};

export type Saldo = {
  base_cents: number;
  notas_cents: number;
  pagado_cents: number;
  saldo_cents: number;
};

export async function getSaldo(compraId: string): Promise<Saldo> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("compras_saldo")
    .select("base_cents, notas_cents, pagado_cents, saldo_cents")
    .eq("compra_id", compraId)
    .maybeSingle();
  const s = data as Saldo | null;
  return {
    base_cents: Number(s?.base_cents ?? 0),
    notas_cents: Number(s?.notas_cents ?? 0),
    pagado_cents: Number(s?.pagado_cents ?? 0),
    saldo_cents: Number(s?.saldo_cents ?? 0),
  };
}

export async function listarNotas(compraId: string): Promise<NotaCredito[]> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("compra_notas_credito")
    .select(
      "id, tipo, monto_cents, motivo, fecha, " +
        "compra_nota_items(id, qty, costo_unitario_cents, line_total_cents, products(sku, name))",
    )
    .eq("compra_id", compraId)
    .order("fecha", { ascending: false });
  return (data ?? []) as unknown as NotaCredito[];
}

export async function listarPagos(compraId: string): Promise<Pago[]> {
  await assertPermiso("inventario_gestionar");
  const { data } = await insforgeAdmin.database
    .from("compra_pagos")
    .select("id, monto_cents, metodo, fecha, referencia, notas")
    .eq("compra_id", compraId)
    .order("fecha", { ascending: false });
  return (data ?? []) as unknown as Pago[];
}

// A note that names products also returns that stock — the RPC does both in one
// transaction, on the user-scoped client so the ledger records who did it.
export async function registrarNota(input: {
  compraId: string;
  tipo: NotaTipo;
  motivo: string | null;
  items: { product_id: string; qty: number; costo_unitario_cents: number }[];
  montoPesos: number | null;
}): Promise<void> {
  await assertPermiso("inventario_gestionar");
  const conItems = input.items.length > 0;
  if (!conItems && !(input.montoPesos && input.montoPesos > 0))
    throw new Error("Indica el importe de la nota");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("crear_nota_credito", {
    p_compra_id: input.compraId,
    p_tipo: input.tipo,
    p_motivo: input.motivo,
    p_items: conItems ? input.items : null,
    p_monto_cents: conItems ? null : Math.max(0, toCents(input.montoPesos || 0)),
  });
  if (error) {
    if (/quantity_check|violates/i.test(error.message ?? ""))
      throw new Error(
        "No se puede: esa mercancía ya salió del inventario. Ajusta el stock antes de registrar la nota.",
      );
    throw new Error(error.message ?? "No se pudo registrar la nota de crédito");
  }
}

export async function registrarPago(input: {
  compraId: string;
  montoPesos: number;
  metodo: MetodoPago;
  fecha: string;
  referencia: string | null;
  notas: string | null;
}): Promise<void> {
  const userId = await assertPermiso("inventario_gestionar");
  const cents = Math.max(0, toCents(input.montoPesos || 0));
  if (cents <= 0) throw new Error("El pago debe ser mayor a cero");

  const { error } = await insforgeAdmin.database.from("compra_pagos").insert([
    {
      compra_id: input.compraId,
      monto_cents: cents,
      metodo: input.metodo,
      fecha: input.fecha,
      referencia: input.referencia?.trim() || null,
      notas: input.notas?.trim() || null,
      created_by: userId,
    },
  ]);
  if (error) throw new Error(error.message ?? "No se pudo registrar el pago");
}

export async function borrarPago(id: string): Promise<void> {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database.from("compra_pagos").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo borrar el pago");
}

// What we owe each supplier: only received purchases with something left.
export type CuentaPorPagar = {
  proveedor_id: string;
  nombre: string;
  /** Net: positive = we owe, negative = they owe us. */
  saldo_cents: number;
  /** Of the above, how much is credit in our favour. */
  favor_cents: number;
  facturas: number;
  vencidas: number;
};

export async function cuentasPorPagar(): Promise<CuentaPorPagar[]> {
  await assertPermiso("inventario_gestionar");
  const [{ data: saldos }, { data: compras }, { data: provs }] = await Promise.all([
    insforgeAdmin.database
      .from("compras_saldo")
      .select("compra_id, proveedor_id, estado, saldo_cents"),
    insforgeAdmin.database.from("compras").select("id, vence_el, condicion"),
    insforgeAdmin.database.from("proveedores").select("id, nombre"),
  ]);

  const nombre = new Map(
    ((provs ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]),
  );
  const vence = new Map(
    ((compras ?? []) as { id: string; vence_el: string; condicion: string }[]).map((c) => [
      c.id,
      c,
    ]),
  );
  const hoy = new Date().toISOString().slice(0, 10);

  const out = new Map<string, CuentaPorPagar>();
  for (const s of (saldos ?? []) as {
    compra_id: string;
    proveedor_id: string;
    estado: string;
    saldo_cents: number;
  }[]) {
    const saldo = Number(s.saldo_cents ?? 0);
    if (s.estado !== "recibida" || saldo === 0) continue;
    // A negative balance is money the supplier owes US — an invoice paid in full
    // for goods that never arrived, once the shortfall is a credit note. It used
    // to be dropped here along with the settled ones, so a credit you were owed
    // simply never appeared anywhere and went unclaimed on the next order.
    const cur =
      out.get(s.proveedor_id) ??
      {
        proveedor_id: s.proveedor_id,
        nombre: nombre.get(s.proveedor_id) ?? "—",
        saldo_cents: 0,
        favor_cents: 0,
        facturas: 0,
        vencidas: 0,
      };
    cur.saldo_cents += saldo;
    if (saldo < 0) cur.favor_cents += -saldo;
    cur.facturas += 1;
    const c = vence.get(s.compra_id);
    if (c && c.condicion === "credito" && c.vence_el && c.vence_el.slice(0, 10) < hoy)
      cur.vencidas += 1;
    out.set(s.proveedor_id, cur);
  }
  return [...out.values()].sort((a, b) => b.saldo_cents - a.saldo_cents);
}

/**
 * A product that does not exist yet, born inside the purchase that buys it.
 *
 * "LG Q60 prime" arrives in the shipment and is in no inventory. The old path
 * was leaving the purchase, creating the product in Inventario, coming back and
 * searching for it — four screens for one line. Now the capture creates it in
 * place.
 *
 * What the new product carries, and why:
 * - quantity 0 — stock enters when the purchase is RECEIVED, like every other
 *   line. Creating with stock would double-count on receive.
 * - cost 0 — the purchase line's cost is the cost, and receiving writes the
 *   FIFO layer. Two places stating the cost would disagree by the second buy.
 * - price 0 — "A cotizar". Inventing a sale price at capture time would put a
 *   made-up number in front of customers; the storefront already hides
 *   unpriced products.
 * - the compra's proveedor — the first thing anyone asks about a new part is
 *   who sells it, and this is the moment that answer is certain.
 */
export async function crearProductoEnCompra(
  compraId: string,
  nombre: string,
  inventoryId: string,
): Promise<{ id: string; name: string; sku: string }> {
  await assertPermiso("inventario_gestionar");
  await assertBorrador(compraId);

  const name = nombre.trim();
  if (name.length < 3) throw new Error("Escribe el nombre de la pieza");
  const sku = slugify(name);
  if (!sku) throw new Error("El nombre no genera un SKU válido");

  const { data: compra } = await insforgeAdmin.database
    .from("compras")
    .select("proveedor_id")
    .eq("id", compraId)
    .maybeSingle();

  // A duplicate sku in the same inventory is the same part typed twice —
  // point at the existing one instead of minting a twin.
  const { data: existente } = await insforgeAdmin.database
    .from("products")
    .select("id, name")
    .eq("inventory_id", inventoryId)
    .eq("sku", sku)
    .maybeSingle();
  if (existente) {
    throw new Error(
      `Ya existe "${(existente as { name: string }).name}" con ese SKU en este inventario — búscalo arriba`,
    );
  }

  const userId = await assertPermiso("inventario_gestionar");
  const { data, error } = await insforgeAdmin.database
    .from("products")
    .insert([
      {
        sku,
        name,
        inventory_id: inventoryId,
        quantity: 0,
        cost_cents: 0,
        price_cents: 0,
        is_active: true,
        proveedor_id: (compra as { proveedor_id: string } | null)?.proveedor_id ?? null,
        created_by: userId,
      },
    ])
    .select("id, name, sku")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el producto");
  return data as { id: string; name: string; sku: string };
}
