// One part number, one card: the same SKU stocked in Mostrador and in
// Guadalajara is one piece in two places. Rows come back best-first.
type Fila = { id: string; sku: string; quantity: number; inventory_id?: string };

export function agruparPorSku<T extends Fila>(
  ps: T[],
  vendible: (p: T) => boolean,
  orden: (inventoryId: string) => number,
): T[][] {
  const grupos = new Map<string, T[]>();
  for (const p of ps) {
    const k = p.sku.trim().toUpperCase();
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  // Sellable stock first, then stock elsewhere, then empty; oldest almacén breaks ties.
  const rango = (p: T) => (vendible(p) && p.quantity > 0 ? 0 : p.quantity > 0 ? 1 : 2) * 1e4 + orden(p.inventory_id ?? "");
  return [...grupos.values()].map((filas) => [...filas].sort((a, b) => rango(a) - rango(b)));
}

/** The row the card's + adds to: the first sellable one with room left. */
export function siguienteFila<T extends Fila>(filas: T[], cart: Record<string, number>, vendible: (p: T) => boolean): T {
  return filas.find((f) => vendible(f) && (cart[f.id] ?? 0) < f.quantity) ?? filas[0];
}
