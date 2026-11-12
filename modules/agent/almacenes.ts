import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Almacen, RutaDia } from "./reparto";

export { ahoraMx, entregaTexto, opcionesEntrega, repartir, type Almacen, type Opcion } from "./reparto";

// One part, several almacenes: Mostrador holds 1 at $2,220, Guadalajara 100 at
// $2,450 that arrive by route or exprés. The agent sells from them in this
// order, each almacén on its own quote.

type Fila = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price_cents: number;
  image_url: string | null;
  inventories: {
    id: string;
    name: string;
    entrega_dias_habiles: number | null;
    solo_consulta: boolean | null;
    ruta: RutaDia[] | null;
    expres_activo: boolean | null;
    expres_dias: number | null;
    expres_corte: string | null;
    expres_costo_cents: number | null;
  } | null;
};

/** Sellable almacenes per SKU, best first: in stock, the counter, soonest. */
export async function almacenesDe(skus: string[]): Promise<Map<string, Almacen[]>> {
  const out = new Map<string, Almacen[]>();
  if (!skus.length) return out;
  const [{ data }, { data: invs }] = await Promise.all([
    insforgeAdmin.database
      .from("products")
      .select(
        "id, sku, name, quantity, price_cents, image_url, inventories(id, name, entrega_dias_habiles, solo_consulta, ruta, expres_activo, expres_dias, expres_corte, expres_costo_cents)",
      )
      .in("sku", [...new Set(skus)])
      .eq("is_active", true),
    insforgeAdmin.database.from("inventories").select("id").order("created_at").limit(1),
  ]);
  const filas = ((data ?? []) as unknown as Fila[]).filter((f) => f.inventories && !f.inventories.solo_consulta);
  // The oldest almacén is the counter (same rule as inventario_mostrador() in SQL).
  const primero = (invs as { id: string }[] | null)?.[0]?.id;
  for (const f of filas) {
    const inv = f.inventories!;
    const mostrador = inv.id === primero;
    const a: Almacen = {
      product_id: f.id,
      nombre: f.name,
      almacen: inv.name,
      existencia: Math.max(0, Number(f.quantity ?? 0)),
      precio_mxn: f.price_cents / 100,
      entrega_dias: inv.entrega_dias_habiles ?? (mostrador ? 0 : null),
      imagen: f.image_url,
      es_mostrador: mostrador,
      ruta: Array.isArray(inv.ruta) && inv.ruta.length ? inv.ruta : null,
      expres: {
        activo: !!inv.expres_activo,
        dias: inv.expres_dias ?? 1,
        corte: inv.expres_corte ?? "16:00",
        costo: (inv.expres_costo_cents ?? 0) / 100,
      },
    };
    out.set(f.sku, [...(out.get(f.sku) ?? []), a]);
  }
  for (const [sku, as] of out) {
    out.set(
      sku,
      as.sort(
        (a, b) =>
          Number(b.existencia > 0) - Number(a.existencia > 0) ||
          Number(b.es_mostrador) - Number(a.es_mostrador) ||
          (a.entrega_dias ?? 99) - (b.entrega_dias ?? 99),
      ),
    );
  }
  return out;
}
