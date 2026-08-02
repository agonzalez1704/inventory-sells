"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";

export type FaltanteLinea = {
  sku: string;
  nombre: string;
  pedidas: number; // committed across live quotes
  enExistencia: number;
  porPedir: number;
  folios: string[]; // which quotes are waiting on it
};

export type FaltantesProveedor = {
  proveedor: string;
  leadTimeDias: number;
  lineas: FaltanteLinea[];
  piezas: number;
};

/**
 * What has to be ordered, grouped by supplier: every product that live quotes
 * (authorized, or still pending) promise beyond what's on the shelf.
 *
 * Demand is summed ACROSS quotes before comparing to stock — two quotes for the
 * last piece are two customers waiting, not one.
 */
export async function faltantesPorProveedor(): Promise<FaltantesProveedor[]> {
  await assertPermiso("inventario_gestionar");

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

  const { data: prodData } = await insforgeAdmin.database
    .from("products")
    .select("sku, quantity, proveedores(nombre, lead_time_dias)")
    .in("sku", [...demanda.keys()]);
  const productos = (prodData ?? []) as unknown as {
    sku: string;
    quantity: number;
    proveedores: { nombre: string; lead_time_dias: number } | null;
  }[];
  const porSku = new Map(productos.map((p) => [p.sku, p]));

  const grupos = new Map<string, FaltantesProveedor>();
  for (const [sku, d] of demanda) {
    const p = porSku.get(sku);
    if (!p) continue; // not in the catalog: nothing to order from anyone
    const stock = Number(p.quantity ?? 0);
    const porPedir = d.qty - stock;
    if (porPedir <= 0) continue;

    const nombre = p.proveedores?.nombre ?? "Sin proveedor asignado";
    const dias = p.proveedores?.lead_time_dias ?? 0;
    const g =
      grupos.get(nombre) ?? { proveedor: nombre, leadTimeDias: dias, lineas: [], piezas: 0 };
    g.lineas.push({
      sku,
      nombre: d.nombre,
      pedidas: d.qty,
      enExistencia: stock,
      porPedir,
      folios: [...d.folios].sort(),
    });
    g.piezas += porPedir;
    g.leadTimeDias = Math.max(g.leadTimeDias, dias);
    grupos.set(nombre, g);
  }

  return [...grupos.values()].sort((a, b) => b.piezas - a.piezas);
}
