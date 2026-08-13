"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { after } from "next/server";
import { attempt, type ActionResult } from "@/lib/errors";
import { notifyGarantia } from "@/lib/push";

/** How a warranty was settled, once somebody with the permission decided. */
export type ResolucionGarantia = "saldo" | "cambio" | "efectivo";

/**
 * What the customer is asking for, as reported by whoever took the part in.
 *
 * Deliberately not the same set as ResolucionGarantia: "devolucion" is a
 * request to escalate — the seller cannot hand cash back — and it is only ever
 * a proposal, never an outcome.
 */
export type PropuestaGarantia = "saldo" | "cambio" | "devolucion";

/**
 * Register a warranty claim against a sale.
 *
 * Everything that matters is enforced in the RPC — the part was on that sale,
 * the units don't exceed what was sold, the sale has a real customer — so this
 * is a thin pass-through. Repeating those checks here would be a second copy
 * to drift.
 */
export async function registrarGarantia(
  saleId: string,
  productId: string,
  qty: number,
  motivo: string | null,
  /** Whether the part goes back on the shelf. The counter's call, no default. */
  reingresa: boolean,
  /** What the customer wants. A proposal — it grants nothing on its own. */
  propuesta: PropuestaGarantia | null,
): Promise<ActionResult<string>> {
  return attempt("registrarGarantia", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("registrar_garantia_cliente", {
      p_sale_id: saleId,
      p_product_id: productId,
      p_qty: qty,
      p_motivo: motivo,
      p_reingresa: reingresa,
      p_propuesta: propuesta,
    });
    if (error) throw new Error(error.message ?? "No se pudo registrar la garantía");
    const id = String(data);
    // After the response: the seller should not wait on a push round trip, and
    // a failed notification must never lose the warranty.
    after(() => notifyGarantia(id));
    return id;
  });
}

/**
 * A customer's store credit, in cents.
 *
 * Admin client on purpose: the register reads this for whoever is standing at
 * the counter, and it is the shop's own liability — not something a seller
 * should need a permission for to be told the customer has money with them.
 */
export async function saldoDeCliente(customerId: string): Promise<number> {
  const { userId } = await auth();
  if (!userId) return 0;
  const { data } = await insforgeAdmin.database.rpc("saldo_de_cliente", {
    p_customer_id: customerId,
  });
  return Number(data ?? 0);
}

export type VentaGarantia = {
  id: string;
  created_at: string;
  total_cents: number;
  customer_id: string | null;
  customer_name: string | null;
  /** True when the sale is on the walk-in placeholder — it cannot carry a warranty. */
  es_mostrador: boolean;
  piezas: number;
};

/**
 * Find the sale a warranty belongs to, from what the customer actually has:
 * their name, the part, or the folio on their ticket.
 *
 * /ventas only filters by date, so before this the only route to an old sale
 * was guessing the day — hopeless for a part that failed months later.
 */
export async function buscarVentasGarantia(q: string): Promise<VentaGarantia[]> {
  const { userId } = await auth();
  if (!userId || q.trim().length < 2) return [];
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database.rpc("buscar_ventas_garantia", {
    p_q: q.trim(),
    p_limit: 20,
  });
  return ((data ?? []) as VentaGarantia[]).map((v) => ({
    ...v,
    piezas: Number(v.piezas),
  }));
}

export type LineaVenta = {
  product_id: string;
  qty: number;
  unit_price_cents: number;
  nombre: string;
  sku: string;
};

/** The chosen sale's lines, once the operator has picked it from the search. */
export async function lineasDeVenta(saleId: string): Promise<LineaVenta[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("sale_items")
    .select("product_id, qty, unit_price_cents, products(name, sku)")
    .eq("sale_id", saleId);
  return ((data ?? []) as unknown as {
    product_id: string | null;
    qty: number;
    unit_price_cents: number;
    products: { name: string; sku: string } | null;
  }[])
    .filter((l) => l.product_id)
    .map((l) => ({
      product_id: l.product_id as string,
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      nombre: l.products?.name ?? "Producto",
      sku: l.products?.sku ?? "",
    }));
}

/**
 * Every customer who is owed something, keyed by id.
 *
 * One call for the whole list. saldoDeCliente answers for one customer, which
 * is right at the register and one round trip per row on a screen.
 */
export async function saldosDeClientes(): Promise<Record<string, number>> {
  const { userId } = await auth();
  if (!userId) return {};
  const { data } = await insforgeAdmin.database.rpc("saldos_de_clientes");
  const filas = (data ?? []) as { customer_id: string; saldo_cents: number }[];
  return Object.fromEntries(filas.map((f) => [f.customer_id, Number(f.saldo_cents)]));
}

export type MovimientoSaldo = {
  id: string;
  monto_cents: number;
  origen: "garantia" | "venta";
  motivo: string | null;
  created_at: string;
  /** The part, on a credit. Null on a spend. */
  pieza: string | null;
  sku: string | null;
  /** How many came back. */
  qty: number | null;
  /** How many were on that line — a partial return is the norm. */
  vendidas: number | null;
  /** The sale to go look at: the one the warranty came from, or the one that spent it. */
  sale_id: string | null;
  garantia_id: string | null;
};

/** The trail behind one balance: what put it there and what spent it. */
export async function movimientosDeSaldo(customerId: string): Promise<MovimientoSaldo[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database.rpc("movimientos_de_saldo", {
    p_customer_id: customerId,
  });
  return ((data ?? []) as MovimientoSaldo[]).map((m) => ({
    ...m,
    monto_cents: Number(m.monto_cents),
  }));
}

export type GarantiaCliente = {
  id: string;
  sale_id: string;
  cliente: string;
  customer_id: string;
  pieza: string;
  sku: string;
  qty: number;
  monto_cents: number;
  motivo: string | null;
  reingresa_stock: boolean;
  estado: "pendiente" | "aceptada" | "rechazada";
  resolucion: ResolucionGarantia | null;
  created_at: string;
  resuelta_at: string | null;
  resolucion_propuesta: PropuestaGarantia | null;
  reportada_por: string | null;
  product_id: string;
  /** Set once the shop has filed the claim upstream. */
  garantia_proveedor_id: string | null;
  proveedor: string | null;
};

/** Pending first — those are the ones somebody still has to act on. */
export async function listarGarantiasCliente(): Promise<GarantiaCliente[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database.rpc("listar_garantias_cliente", {
    p_limite: 200,
  });
  return ((data ?? []) as GarantiaCliente[]).map((g) => ({
    ...g,
    qty: Number(g.qty),
    monto_cents: Number(g.monto_cents),
  }));
}

/**
 * Settle a pending warranty. A null resolution rejects it.
 *
 * Rejecting is an outcome, not a delete: "we looked at it and it is not
 * covered" is something the shop has to be able to show the customer later.
 */
export async function resolverGarantia(
  id: string,
  resolucion: ResolucionGarantia | null,
  motivo: string | null,
): Promise<ActionResult<null>> {
  return attempt("resolverGarantia", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.rpc("resolver_garantia_cliente", {
      p_id: id,
      p_resolucion: resolucion,
      p_motivo: motivo,
    });
    if (error) throw new Error(error.message ?? "No se pudo resolver");
    return null;
  });
}

/**
 * File the supplier claim for a customer's warranty, and chain the two.
 *
 * The amount defaults to COST, not to what the customer paid — those are
 * different numbers and claiming the second over-claims. The operator can
 * override when they know better than the last purchase price.
 */
export async function reclamarAProveedor(
  garantiaId: string,
  proveedorId: string,
  montoCents: number | null,
  notas: string | null,
): Promise<ActionResult<string>> {
  return attempt("reclamarAProveedor", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("reclamar_garantia_a_proveedor", {
      p_garantia_id: garantiaId,
      p_proveedor_id: proveedorId,
      p_monto_cents: montoCents,
      p_notas: notas,
    });
    if (error) throw new Error(error.message ?? "No se pudo crear el reclamo");
    return String(data);
  });
}
