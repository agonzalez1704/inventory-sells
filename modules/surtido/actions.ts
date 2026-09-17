"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";

export type FaltanteLinea = {
  sku: string;
  nombre: string;
  pedidas: number; // committed across live quotes
  enExistencia: number;
  /** Already asked of a supplier and not received yet. */
  yaPedidas: number;
  porPedir: number;
  folios: string[]; // which quotes are waiting on it
  /** Products carrying this SKU, to assign a supplier from here. */
  productIds: string[];
};

export type FaltantesProveedor = {
  proveedorId: string | null;
  proveedor: string;
  telefono: string | null;
  leadTimeDias: number;
  lineas: FaltanteLinea[];
  piezas: number;
};

export type PedidoSurtido = {
  id: string;
  sku: string;
  nombre: string | null;
  qty: number;
  proveedor: string | null;
  nota: string | null;
  quien: string;
  pedidoAt: string;
};

/**
 * What has to be ordered, grouped by supplier: every product that live quotes
 * (authorized, or still pending) promise beyond what's on the shelf and beyond
 * what is already on its way from a supplier.
 *
 * Demand is summed ACROSS quotes before comparing to stock — two quotes for the
 * last piece are two customers waiting, not one. Stock is summed across every
 * inventory carrying the SKU (reading one of them said "order more" while the
 * pieces sat in the other branch).
 */
export async function faltantesPorProveedor(): Promise<FaltantesProveedor[]> {
  await assertPermiso("surtir");

  const { data: cots } = await insforgeAdmin.database
    .from("cotizaciones")
    .select("id, folio, estado")
    .in("estado", ["pendiente", "autorizada"]);
  const vivas = (cots ?? []) as { id: string; folio: string; estado: string }[];
  if (vivas.length === 0) return [];

  const { data: itemData } = await insforgeAdmin.database
    .from("cotizacion_items")
    .select("cotizacion_id, sku, nombre, qty")
    .in(
      "cotizacion_id",
      vivas.map((c) => c.id),
    );
  const items = (itemData ?? []) as {
    cotizacion_id: string;
    sku: string | null;
    nombre: string;
    qty: number;
  }[];
  if (items.length === 0) return [];

  const folioDe = new Map(vivas.map((c) => [c.id, c.folio]));

  // Demand per SKU across every live quote.
  const demanda = new Map<string, { nombre: string; qty: number; folios: Set<string> }>();
  for (const it of items) {
    if (!it.sku) continue;
    const cur = demanda.get(it.sku) ?? { nombre: it.nombre, qty: 0, folios: new Set<string>() };
    cur.qty += Number(it.qty ?? 0);
    const f = folioDe.get(it.cotizacion_id);
    if (f) cur.folios.add(f);
    demanda.set(it.sku, cur);
  }

  const skus = [...demanda.keys()];
  const [{ data: prodData }, { data: pedidoData }] = await Promise.all([
    insforgeAdmin.database
      .from("products")
      .select("id, sku, quantity, proveedor_id, proveedores(nombre, telefono, lead_time_dias)")
      .in("sku", skus)
      .eq("is_active", true),
    insforgeAdmin.database.from("surtido_pedidos").select("sku, qty").eq("estado", "pedido").in("sku", skus),
  ]);
  type Prod = {
    id: string;
    sku: string;
    quantity: number;
    proveedor_id: string | null;
    proveedores: { nombre: string; telefono: string | null; lead_time_dias: number } | null;
  };
  const productos = (prodData ?? []) as unknown as Prod[];
  const porSku = new Map<string, Prod[]>();
  for (const p of productos) porSku.set(p.sku, [...(porSku.get(p.sku) ?? []), p]);
  const enCamino = new Map<string, number>();
  for (const p of (pedidoData ?? []) as { sku: string; qty: number }[])
    enCamino.set(p.sku, (enCamino.get(p.sku) ?? 0) + Number(p.qty ?? 0));

  const grupos = new Map<string, FaltantesProveedor>();
  for (const [sku, d] of demanda) {
    const ps = porSku.get(sku);
    if (!ps?.length) continue; // not in the catalog: nothing to order from anyone
    const stock = ps.reduce((s, p) => s + Number(p.quantity ?? 0), 0);
    const yaPedidas = enCamino.get(sku) ?? 0;
    const porPedir = d.qty - stock - yaPedidas;
    if (porPedir <= 0) continue;

    // The supplier of whichever product has one (they share the SKU).
    const conProv = ps.find((p) => p.proveedores) ?? ps[0];
    const clave = conProv.proveedor_id ?? "sin";
    const g =
      grupos.get(clave) ??
      ({
        proveedorId: conProv.proveedor_id ?? null,
        proveedor: conProv.proveedores?.nombre ?? "Sin proveedor",
        telefono: conProv.proveedores?.telefono ?? null,
        leadTimeDias: conProv.proveedores?.lead_time_dias ?? 0,
        lineas: [],
        piezas: 0,
      } satisfies FaltantesProveedor);
    g.lineas.push({
      sku,
      nombre: d.nombre,
      pedidas: d.qty,
      enExistencia: stock,
      yaPedidas,
      porPedir,
      folios: [...d.folios].sort(),
      productIds: ps.map((p) => p.id),
    });
    g.piezas += porPedir;
    g.leadTimeDias = Math.max(g.leadTimeDias, conProv.proveedores?.lead_time_dias ?? 0);
    grupos.set(clave, g);
  }

  return [...grupos.values()].sort((a, b) => b.piezas - a.piezas);
}

/** What was asked of a supplier and hasn't arrived: the "Por llegar" tab. */
export async function pedidosEnCamino(): Promise<PedidoSurtido[]> {
  await assertPermiso("surtir");
  const { data } = await insforgeAdmin.database
    .from("surtido_pedidos")
    .select("id, sku, nombre, qty, nota, pedido_por, pedido_at, proveedores(nombre)")
    .eq("estado", "pedido")
    .order("pedido_at", { ascending: false });
  const rows = (data ?? []) as unknown as {
    id: string;
    sku: string;
    nombre: string | null;
    qty: number;
    nota: string | null;
    pedido_por: string | null;
    pedido_at: string;
    proveedores: { nombre: string } | null;
  }[];
  const ids = [...new Set(rows.map((r) => r.pedido_por).filter(Boolean))] as string[];
  const { data: profs } = ids.length
    ? await insforgeAdmin.database.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const nombre = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "—"]));
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    nombre: r.nombre,
    qty: Number(r.qty),
    proveedor: r.proveedores?.nombre ?? null,
    nota: r.nota,
    quien: r.pedido_por ? (nombre.get(r.pedido_por) ?? "—") : "—",
    pedidoAt: r.pedido_at,
  }));
}

/**
 * Mark a supplier's lines as ordered. They leave "Por pedir" and wait in "Por
 * llegar", so the same piece isn't asked for twice while it travels.
 */
export async function marcarPedidoProveedor(input: {
  proveedorId: string | null;
  lineas: { sku: string; nombre: string; qty: number }[];
  nota: string | null;
}): Promise<ActionResult<{ n: number }>> {
  return attempt("marcarPedidoProveedor", async () => {
    const { userId } = await auth();
    await assertPermiso("surtir");
    const filas = input.lineas
      .filter((l) => l.sku && Number.isFinite(l.qty) && l.qty > 0)
      .map((l) => ({
        sku: l.sku,
        nombre: l.nombre?.slice(0, 200) ?? null,
        qty: Math.round(l.qty),
        proveedor_id: input.proveedorId,
        nota: input.nota?.trim().slice(0, 300) || null,
        pedido_por: userId,
      }));
    if (!filas.length) throw new Error("Nada que marcar");
    const { error } = await insforgeAdmin.database.from("surtido_pedidos").insert(filas);
    if (error) throw new Error(error.message ?? "No se pudo marcar el pedido");
    revalidatePath("/surtido");
    return { n: filas.length };
  });
}

/** It arrived (or it isn't coming): the line leaves "Por llegar". */
export async function cerrarPedidoSurtido(id: string, estado: "recibido" | "cancelado"): Promise<ActionResult<null>> {
  return attempt("cerrarPedidoSurtido", async () => {
    await assertPermiso("surtir");
    const { error } = await insforgeAdmin.database
      .from("surtido_pedidos")
      .update({ estado, cerrado_at: new Date().toISOString() })
      .eq("id", id)
      .eq("estado", "pedido");
    if (error) throw new Error(error.message ?? "No se pudo cerrar");
    revalidatePath("/surtido");
    return null;
  });
}

/** Suppliers to pick from, for the pieces that have none. */
export async function proveedoresParaSurtir(): Promise<{ id: string; nombre: string; telefono: string | null }[]> {
  await assertPermiso("surtir");
  const { data } = await insforgeAdmin.database
    .from("proveedores")
    .select("id, nombre, telefono")
    .eq("is_active", true)
    .order("nombre");
  return (data ?? []) as { id: string; nombre: string; telefono: string | null }[];
}

/** Assign the supplier of every product carrying a SKU, from this screen. */
export async function asignarProveedorASku(productIds: string[], proveedorId: string): Promise<ActionResult<null>> {
  return attempt("asignarProveedorASku", async () => {
    await assertPermiso("surtir");
    if (!productIds.length) throw new Error("Sin productos");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.from("products").update({ proveedor_id: proveedorId }).in("id", productIds);
    if (error) throw new Error(error.message ?? "No se pudo asignar el proveedor");
    revalidatePath("/surtido");
    return null;
  });
}
