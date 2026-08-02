// Plan de surtido (R7): given what a customer wants, work out what we can hand
// over now and what has to be ordered from whom — because a note can mix parts
// we hold with parts that live at two different suppliers' warehouses, each
// with its own delivery time.
//
// Pure functions over plain data: no database, no React, so the arithmetic can
// be checked on its own.

export type ItemPedido = {
  sku: string | null;
  nombre: string;
  qty: number;
};

export type ProductoSurtido = {
  sku: string;
  quantity: number; // stock on hand
  proveedor: { nombre: string; lead_time_dias: number } | null;
};

export type LineaSurtido = {
  sku: string | null;
  nombre: string;
  qty: number;
  enExistencia: number; // how many we can hand over right now
  porPedir: number; // the rest, which has to come from the supplier
};

export type GrupoProveedor = {
  proveedor: string; // "En existencia" for what we already hold
  leadTimeDias: number;
  lineas: LineaSurtido[];
  piezas: number;
};

export type PlanSurtido = {
  grupos: GrupoProveedor[];
  /** Working days until the whole order can be handed over complete. */
  diasParaCompletar: number;
  /** Everything is on the shelf right now. */
  completo: boolean;
  /** Wanted but not in the catalog — can't promise a date for these. */
  desconocidos: LineaSurtido[];
};

/**
 * Split an order into what ships now and what waits on each supplier.
 * Stock is honoured first: 3 wanted with 1 on hand = 1 now, 2 ordered.
 */
export function planSurtido(
  items: ItemPedido[],
  catalogo: Map<string, ProductoSurtido>,
): PlanSurtido {
  const enExistencia: LineaSurtido[] = [];
  const porProveedor = new Map<string, GrupoProveedor>();
  const desconocidos: LineaSurtido[] = [];

  for (const it of items) {
    const qty = Math.max(0, Math.round(it.qty));
    if (qty === 0) continue;
    const prod = it.sku ? catalogo.get(it.sku) : undefined;

    if (!prod) {
      desconocidos.push({ sku: it.sku, nombre: it.nombre, qty, enExistencia: 0, porPedir: qty });
      continue;
    }

    const hay = Math.max(0, Math.min(qty, prod.quantity));
    const falta = qty - hay;

    if (hay > 0) {
      enExistencia.push({ sku: it.sku, nombre: it.nombre, qty: hay, enExistencia: hay, porPedir: 0 });
    }
    if (falta > 0) {
      // No supplier on the product = nobody to order it from; it still has to be
      // shown as missing rather than silently promised.
      const nombre = prod.proveedor?.nombre ?? "Sin proveedor asignado";
      const dias = prod.proveedor?.lead_time_dias ?? 0;
      const g = porProveedor.get(nombre) ?? {
        proveedor: nombre,
        leadTimeDias: dias,
        lineas: [],
        piezas: 0,
      };
      g.lineas.push({ sku: it.sku, nombre: it.nombre, qty: falta, enExistencia: hay, porPedir: falta });
      g.piezas += falta;
      // A supplier's lead time is per-supplier, but keep the longest seen in
      // case two products of theirs disagree.
      g.leadTimeDias = Math.max(g.leadTimeDias, dias);
      porProveedor.set(nombre, g);
    }
  }

  const grupos: GrupoProveedor[] = [];
  if (enExistencia.length > 0) {
    grupos.push({
      proveedor: "En existencia",
      leadTimeDias: 0,
      lineas: enExistencia,
      piezas: enExistencia.reduce((s, l) => s + l.qty, 0),
    });
  }
  // Soonest first: what the customer gets earliest leads the list.
  grupos.push(...[...porProveedor.values()].sort((a, b) => a.leadTimeDias - b.leadTimeDias));

  const pendientes = grupos.filter((g) => g.proveedor !== "En existencia");
  const diasParaCompletar = pendientes.reduce((m, g) => Math.max(m, g.leadTimeDias), 0);

  return {
    grupos,
    diasParaCompletar,
    completo: pendientes.length === 0 && desconocidos.length === 0,
    desconocidos,
  };
}

/** "hoy" / "mañana" / "en 3 días" — how the seller says it to the customer. */
export function entregaTexto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}
