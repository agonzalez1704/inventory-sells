"use server";

import { auth } from "@clerk/nextjs/server";
import { assertPermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { attempt, type ActionResult } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { buscarProductos } from "@/modules/inventory/buscar";
import { registerLoan } from "./actions";
import type { SalesProduct } from "./SalesScreen";

/**
 * "Pieza de fuera": cash leaves the drawer to buy a part at the shop next
 * door, the part is handed to a customer, and the cash comes back when they
 * pay. Everything here reuses what the shop already keeps: the part becomes
 * a product in a "Piezas de fuera" inventory, the purchase is a received and
 * paid compra (so the cost is real and FIFO), the withdrawal is a gasto tied
 * to the sale, and the sale is an ordinary note or charge.
 */

const INVENTARIO = "Piezas de fuera";
const CATEGORIA_GASTO = "Piezas de fuera";

export type Vecino = { id: string; nombre: string };

/** Suppliers, for whoever sells — proveedores' own list needs inventory rights. */
export async function listarVecinos(): Promise<Vecino[]> {
  await assertPermiso("pos_vender");
  const { data } = await insforgeAdmin.database
    .from("proveedores")
    .select("id, nombre")
    .eq("is_active", true)
    .order("nombre");
  return (data ?? []) as Vecino[];
}

export async function crearVecino(nombre: string): Promise<ActionResult<Vecino>> {
  return attempt("crearVecino", async () => {
    const userId = await assertPermiso("pos_vender");
    const n = nombre.trim().replace(/\s+/g, " ");
    if (n.length < 2) throw new Error("Escribe el nombre del negocio");
    const { data, error } = await insforgeAdmin.database
      .from("proveedores")
      .insert([{ nombre: n, lead_time_dias: 0, created_by: userId }])
      .select("id, nombre")
      .single();
    if (error || !data) {
      if (/duplicate|unique/i.test(error?.message ?? "")) throw new Error("Ya existe un proveedor con ese nombre");
      throw new Error(error?.message ?? "No se pudo crear");
    }
    return data as Vecino;
  });
}

export type Referencia = { nombre: string; precio_cents: number; quantity: number; inventario: string | null };

/** The closest thing in our own catalog, so the counter does not undercharge. */
export async function referenciaCatalogo(nombre: string): Promise<Referencia | null> {
  const q = nombre.trim();
  if (q.length < 3) return null;
  const rows = await buscarProductos({ query: q, limit: 5 });
  const r = rows.find((x) => x.price_cents > 0 && !/^piezas de fuera$/i.test(x.inventory_name ?? ""));
  return r ? { nombre: r.name, precio_cents: r.price_cents, quantity: r.quantity, inventario: r.inventory_name ?? null } : null;
}

async function sucursalDeHoy(userId: string): Promise<string | null> {
  const { startISO, endISO } = rangoUTC(mxHoy(), mxHoy());
  const { data } = await insforgeAdmin.database
    .from("checkins")
    .select("sucursal_id")
    .eq("profile_id", userId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .limit(1);
  return ((data ?? []) as { sucursal_id: string }[])[0]?.sucursal_id ?? null;
}

/** The "Piezas de fuera" inventory of the seller's branch, made on first use. */
async function inventarioDeFuera(userId: string): Promise<string> {
  const sucursal = await sucursalDeHoy(userId);
  let q = insforgeAdmin.database.from("inventories").select("id").eq("name", INVENTARIO);
  q = sucursal ? q.eq("sucursal_id", sucursal) : q.is("sucursal_id", null);
  const { data } = await q.limit(1);
  const existente = ((data ?? []) as { id: string }[])[0];
  if (existente) return existente.id;
  const { data: nuevo, error } = await insforgeAdmin.database
    .from("inventories")
    .insert([{ name: INVENTARIO, sucursal_id: sucursal, created_by: userId }])
    .select("id")
    .single();
  if (error || !nuevo) throw new Error(error?.message ?? "No se pudo crear el inventario de piezas de fuera");
  return (nuevo as { id: string }).id;
}

export type PiezaFueraInput = {
  nombre: string;
  qty: number;
  vecinoId: string;
  costoCents: number;
  precioCents: number;
  customerId: string | null;
  /** "nota": a credit note now. "pagar": the part goes to the cart to charge. */
  entrega: "nota" | "pagar";
};

export type PiezaFueraResult = {
  product: SalesProduct;
  /** How many were bought this time — the cart takes these, not old stock. */
  qty: number;
  /** The credit note, when entrega is "nota". */
  saleId: string | null;
  /** Not recorded on the drawer — the seller should capture the gasto by hand. */
  gastoFallo: string | null;
};

export async function registrarPiezaDeFuera(input: PiezaFueraInput): Promise<ActionResult<PiezaFueraResult>> {
  return attempt("registrarPiezaDeFuera", async () => {
    const userId = await assertPermiso("pos_vender");
    const nombre = input.nombre.trim().replace(/\s+/g, " ");
    const qty = Math.max(1, Math.round(input.qty || 1));
    const costo = Math.round(input.costoCents);
    const precio = Math.round(input.precioCents);
    if (nombre.length < 3) throw new Error("Escribe qué pieza es");
    if (!input.vecinoId) throw new Error("¿A quién se le compró?");
    if (!(costo > 0)) throw new Error("¿Cuánto se pagó por la pieza?");
    if (!(precio > 0)) throw new Error("Ponle precio al cliente");
    if (input.entrega === "nota" && !input.customerId) throw new Error("Una nota necesita cliente");

    const { data: vec } = await insforgeAdmin.database.from("proveedores").select("nombre").eq("id", input.vecinoId).maybeSingle();
    const vecino = (vec as { nombre: string } | null)?.nombre;
    if (!vecino) throw new Error("Ese proveedor ya no existe");

    // 1. The part, in this branch's "Piezas de fuera". Bought again later, the
    //    same part is reused: its stock and cost layers simply grow.
    const inventoryId = await inventarioDeFuera(userId);
    const sku = slugify(nombre) || `pieza-${Date.now()}`;
    const { data: prev } = await insforgeAdmin.database
      .from("products")
      .select("id")
      .eq("inventory_id", inventoryId)
      .eq("sku", sku)
      .maybeSingle();
    let productId = (prev as { id: string } | null)?.id ?? null;
    if (productId) {
      await insforgeAdmin.database.from("products").update({ price_cents: precio, is_active: true, proveedor_id: input.vecinoId }).eq("id", productId);
    } else {
      const { data: np, error } = await insforgeAdmin.database
        .from("products")
        .insert([{ sku, name: nombre, inventory_id: inventoryId, quantity: 0, cost_cents: costo, price_cents: precio, is_active: true, proveedor_id: input.vecinoId, created_by: userId }])
        .select("id")
        .single();
      if (error || !np) throw new Error(error?.message ?? "No se pudo crear la pieza");
      productId = (np as { id: string }).id;
    }

    // 2. The purchase: received (stock + FIFO layer at the real cost) and paid
    //    in cash, so the part's cost and the supplier's account are right.
    const { data: compra, error: ce } = await insforgeAdmin.database
      .from("compras")
      .insert([{ proveedor_id: input.vecinoId, fecha_ingreso: mxHoy(), condicion: "contado", total_factura_cents: costo * qty, notas: `Pieza de fuera · ${nombre}`, created_by: userId }])
      .select("id")
      .single();
    if (ce || !compra) throw new Error(ce?.message ?? "No se pudo registrar la compra");
    const compraId = (compra as { id: string }).id;
    // line_total_cents is computed by the table (qty × cost): never sent.
    const { error: ie } = await insforgeAdmin.database
      .from("compra_items")
      .insert([{ compra_id: compraId, product_id: productId, qty, qty_pedida: qty, costo_unitario_cents: costo }]);
    if (ie) {
      // A draft with no lines would sit in Compras forever: take it back out.
      await insforgeAdmin.database.from("compras").delete().eq("id", compraId);
      throw new Error(ie.message ?? "No se pudo registrar la compra");
    }
    const insforge = await createInsForgeServerClient();
    const { error: re } = await insforge.database.rpc("confirmar_compra", { p_id: compraId });
    if (re) throw new Error(re.message ?? "No se pudo recibir la pieza");
    await insforgeAdmin.database
      .from("compra_pagos")
      .insert([{ compra_id: compraId, monto_cents: costo * qty, metodo: "efectivo", fecha: mxHoy(), notas: "Pagada del cajón", created_by: userId }]);

    // 3. The sale: a note now, or the cart (the normal charge follows).
    let saleId: string | null = null;
    if (input.entrega === "nota") {
      const r = await registerLoan([{ product_id: productId, qty }], input.customerId, `Pieza de fuera · ${vecino}`);
      saleId = r.saleId;
    }

    // 4. The withdrawal, last: a failure here never undoes the sale — the
    //    seller is told to capture the gasto by hand.
    let gastoFallo: string | null = null;
    const { error: ge } = await insforgeAdmin.database.from("gastos").insert([
      {
        concepto: `Pieza de fuera · ${nombre}${qty > 1 ? ` ×${qty}` : ""} · ${vecino}`,
        monto_cents: costo * qty,
        metodo: "efectivo",
        categoria: CATEGORIA_GASTO,
        sale_id: saleId,
        created_by: userId,
      },
    ]);
    if (ge) gastoFallo = ge.message ?? "no se pudo registrar el gasto";

    const { data: p } = await insforgeAdmin.database
      .from("products")
      .select("id, sku, name, brand, size, category, price_cents, quantity, inventory_id, inventories(name)")
      .eq("id", productId)
      .single();
    const row = p as unknown as SalesProduct & { inventories: { name: string } | { name: string }[] | null };
    const inv = Array.isArray(row.inventories) ? row.inventories[0] : row.inventories;
    const { inventories: _i, ...prod } = row;
    return { product: { ...prod, inventory_name: inv?.name ?? INVENTARIO }, qty, saleId, gastoFallo };
  });
}

export type PrecioDeFuera = {
  pieza: string;
  vecinoId: string;
  vecino: string;
  costo_cents: number;
  fecha: string;
};

/**
 * What this part cost last time, and at which neighbour: every pieza de fuera
 * is a received purchase, so the history is already there. Newest first.
 */
export async function preciosDeFuera(nombre: string): Promise<PrecioDeFuera[]> {
  const q = nombre.trim();
  if (q.length < 3) return [];
  const rows = await buscarProductos({ query: q, limit: 20 });
  const ids = rows.filter((r) => /^piezas de fuera$/i.test(r.inventory_name ?? "")).map((r) => r.id);
  if (!ids.length) return [];
  const { data } = await insforgeAdmin.database
    .from("compra_items")
    .select("costo_unitario_cents, created_at, products(name), compras(fecha_ingreso, proveedor_id, estado, proveedores(nombre))")
    .in("product_id", ids)
    .order("created_at", { ascending: false })
    .limit(12);
  type Uno<T> = T | T[] | null;
  const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const vistos = new Set<string>();
  const out: PrecioDeFuera[] = [];
  for (const r of (data ?? []) as unknown as {
    costo_unitario_cents: number;
    products: Uno<{ name: string }>;
    compras: Uno<{ fecha_ingreso: string; proveedor_id: string; estado: string; proveedores: Uno<{ nombre: string }> }>;
  }[]) {
    const c = uno(r.compras);
    const prov = c ? uno(c.proveedores) : null;
    if (!c || !prov || c.estado !== "recibida") continue;
    // One line per neighbour: the last price each one gave.
    if (vistos.has(c.proveedor_id)) continue;
    vistos.add(c.proveedor_id);
    out.push({ pieza: uno(r.products)?.name ?? q, vecinoId: c.proveedor_id, vecino: prov.nombre, costo_cents: r.costo_unitario_cents, fecha: c.fecha_ingreso });
    if (out.length >= 4) break;
  }
  return out;
}
