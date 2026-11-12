import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { Almacen } from "./reparto";

export { entregaTexto, repartir, type Almacen } from "./reparto";

// One part, several almacenes: Mostrador holds 1 at $2,220, Guadalajara 100 at
// $2,450 that take days to arrive. The agent sells from them in this order and
// tells the customer when an order spans more than the first.


type Fila = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price_cents: number;
  image_url: string | null;
  inventories: { id: string; name: string; entrega_dias_habiles: number | null; solo_consulta: boolean | null } | null;
};

/** Sellable almacenes per SKU, best first: in stock, soonest, oldest. */
export async function almacenesDe(skus: string[]): Promise<Map<string, Almacen[]>> {
  const out = new Map<string, Almacen[]>();
  if (!skus.length) return out;
  const [{ data }, { data: invs }] = await Promise.all([
    insforgeAdmin.database
      .from("products")
      .select("id, sku, name, quantity, price_cents, image_url, inventories(id, name, entrega_dias_habiles, solo_consulta)")
      .in("sku", [...new Set(skus)])
      .eq("is_active", true),
    insforgeAdmin.database.from("inventories").select("id").order("created_at").limit(1),
  ]);
  const filas = ((data ?? []) as unknown as Fila[]).filter((f) => f.inventories && !f.inventories.solo_consulta);
  // ponytail: the oldest almacén is the counter. Its blank delivery time means
  // "here now"; every other blank stays unknown until someone fills it in
  // Inventario → Editar.
  const primero = (invs as { id: string }[] | null)?.[0]?.id;
  for (const f of filas) {
    const inv = f.inventories!;
    const a: Almacen = {
      product_id: f.id,
      nombre: f.name,
      almacen: inv.name,
      existencia: Math.max(0, Number(f.quantity ?? 0)),
      precio_mxn: f.price_cents / 100,
      entrega_dias: inv.entrega_dias_habiles ?? (inv.id === primero ? 0 : null),
      imagen: f.image_url,
    };
    out.set(f.sku, [...(out.get(f.sku) ?? []), a]);
  }
  for (const [sku, as] of out) {
    out.set(
      sku,
      as.sort(
        (a, b) =>
          Number(b.existencia > 0) - Number(a.existencia > 0) ||
          (a.entrega_dias ?? 99) - (b.entrega_dias ?? 99),
      ),
    );
  }
  return out;
}
