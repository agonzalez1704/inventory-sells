import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { rangoUTC } from "@/lib/caja-range";

// Analytics over InsForge for the MCP server. The bearer token already gates
// access (owner = full access), so these run with the admin client and include
// cost/profit. Amounts are returned in pesos (MXN) for human-friendly answers.

const DB = insforgeAdmin.database;

export type Periodo = "hoy" | "7d" | "30d";

function sinceISO(p: Periodo): string {
  if (p === "hoy") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = p === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const pesos = (cents: number) => Math.round(cents) / 100;

type SaleAgg = {
  total_cents: number;
  sale_items: {
    qty: number;
    unit_price_cents: number;
    products: { name: string; sku: string; cost_cents: number } | null;
  }[];
};

export async function ventasResumen(periodo: Periodo) {
  const { data } = await DB.from("sales")
    .select("total_cents, sale_items(qty, products(cost_cents))")
    .eq("status", "completed")
    .gte("created_at", sinceISO(periodo));
  const sales = (data ?? []) as unknown as SaleAgg[];

  const ingresos = sales.reduce((s, x) => s + x.total_cents, 0);
  let cogs = 0;
  for (const s of sales)
    for (const it of s.sale_items ?? [])
      cogs += (it.products?.cost_cents ?? 0) * it.qty;

  return {
    periodo,
    ventas: sales.length,
    ingresos_mxn: pesos(ingresos),
    ganancia_estimada_mxn: pesos(ingresos - cogs),
    ticket_promedio_mxn: sales.length ? pesos(ingresos / sales.length) : 0,
  };
}

export async function masVendidos(periodo: Periodo, limite = 5) {
  const { data } = await DB.from("sales")
    .select("sale_items(qty, unit_price_cents, products(name, sku))")
    .eq("status", "completed")
    .gte("created_at", sinceISO(periodo));
  const sales = (data ?? []) as unknown as SaleAgg[];

  const map = new Map<
    string,
    { producto: string; sku: string; vendidos: number; ingreso_mxn: number }
  >();
  for (const s of sales)
    for (const it of s.sale_items ?? []) {
      const sku = it.products?.sku ?? "—";
      const cur = map.get(sku) ?? {
        producto: it.products?.name ?? "—",
        sku,
        vendidos: 0,
        ingreso_mxn: 0,
      };
      cur.vendidos += it.qty;
      cur.ingreso_mxn += pesos(it.unit_price_cents * it.qty);
      map.set(sku, cur);
    }

  return [...map.values()]
    .sort((a, b) => b.ingreso_mxn - a.ingreso_mxn)
    .slice(0, Math.max(1, Math.min(20, Math.floor(limite))));
}

type LoanAgg = {
  total_cents: number;
  note: string | null;
  created_at: string;
  sale_items: { qty: number; products: { name: string } | null }[];
  sale_pagos: { monto_cents: number }[];
};

export async function fiadosPendientes() {
  const { data } = await DB.from("sales")
    .select("total_cents, note, created_at, sale_items(qty, products(name)), sale_pagos(monto_cents)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const loans = (data ?? []) as unknown as LoanAgg[];

  const fiados = loans.map((l) => {
    const pagado = (l.sale_pagos ?? []).reduce((s, p) => s + p.monto_cents, 0);
    return {
      cliente: l.note ?? "sin nota",
      total_mxn: pesos(l.total_cents),
      pagado_mxn: pesos(pagado),
      resta_mxn: pesos(Math.max(0, l.total_cents - pagado)),
      dias: Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86_400_000),
      productos: (l.sale_items ?? [])
        .map((it) => `${it.products?.name ?? "?"}${it.qty > 1 ? ` x${it.qty}` : ""}`)
        .join(", "),
    };
  });

  return {
    por_cobrar_mxn: fiados.reduce((s, f) => s + f.resta_mxn, 0),
    pendientes: fiados.length,
    fiados,
  };
}

type AdelantoAgg = {
  tipo: "apartado" | "pedido";
  descripcion: string | null;
  qty: number;
  precio_cents: number;
  cliente: string | null;
  created_at: string;
  products: { name: string } | null;
  adelanto_pagos: { monto_cents: number; tipo: "abono" | "devolucion" }[];
};

export async function adelantosPendientes() {
  const { data } = await DB.from("adelantos")
    .select(
      "tipo, descripcion, qty, precio_cents, cliente, created_at, products(name), adelanto_pagos(monto_cents, tipo)",
    )
    .eq("estado", "activo")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as AdelantoAgg[];

  const adelantos = rows.map((a) => {
    const pagado = (a.adelanto_pagos ?? []).reduce(
      (s, p) => s + (p.tipo === "abono" ? p.monto_cents : -p.monto_cents),
      0,
    );
    return {
      tipo: a.tipo,
      producto: a.products?.name ?? a.descripcion ?? "—",
      cliente: a.cliente ?? "sin nombre",
      precio_mxn: pesos(a.precio_cents * 1),
      pagado_mxn: pesos(pagado),
      resta_mxn: pesos(Math.max(0, a.precio_cents - pagado)),
      dias: Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86_400_000),
    };
  });

  return {
    por_cobrar_mxn: adelantos.reduce((s, a) => s + a.resta_mxn, 0),
    abonado_mxn: adelantos.reduce((s, a) => s + a.pagado_mxn, 0),
    activos: adelantos.length,
    adelantos,
  };
}

type ProductRow = {
  inventory_id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  cost_cents: number;
  price_cents: number;
  quantity: number;
  is_active: boolean;
};

async function inventoryNames(): Promise<Map<string, string>> {
  const { data } = await DB.from("inventories").select("id, name");
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
}

export async function listarInventarios() {
  const [names, { data: pData }] = await Promise.all([
    inventoryNames(),
    DB.from("products")
      .select("inventory_id, price_cents, quantity")
      .eq("is_active", true),
  ]);
  const ps = (pData ?? []) as Pick<
    ProductRow,
    "inventory_id" | "price_cents" | "quantity"
  >[];

  return [...names.entries()].map(([id, inventario]) => {
    const items = ps.filter((p) => p.inventory_id === id);
    return {
      inventario,
      productos: items.length,
      unidades: items.reduce((s, p) => s + p.quantity, 0),
      valor_venta_mxn: pesos(
        items.reduce((s, p) => s + p.price_cents * p.quantity, 0),
      ),
    };
  });
}

export async function estadoInventario() {
  const [names, { data }] = await Promise.all([
    inventoryNames(),
    DB.from("products")
      .select("inventory_id, sku, name, price_cents, quantity")
      .eq("is_active", true),
  ]);
  const ps = (data ?? []) as Pick<
    ProductRow,
    "inventory_id" | "sku" | "name" | "price_cents" | "quantity"
  >[];
  const inv = (id: string) => names.get(id) ?? "—";

  const porInv = new Map<
    string,
    {
      inventario: string;
      productos: number;
      unidades: number;
      valor_venta_mxn: number;
      agotados: number;
      bajo_stock: number;
    }
  >();
  for (const p of ps) {
    const name = inv(p.inventory_id);
    const cur = porInv.get(name) ?? {
      inventario: name,
      productos: 0,
      unidades: 0,
      valor_venta_mxn: 0,
      agotados: 0,
      bajo_stock: 0,
    };
    cur.productos += 1;
    cur.unidades += p.quantity;
    cur.valor_venta_mxn += pesos(p.price_cents * p.quantity);
    if (p.quantity === 0) cur.agotados += 1;
    else if (p.quantity <= 5) cur.bajo_stock += 1;
    porInv.set(name, cur);
  }

  return {
    productos: ps.length,
    unidades: ps.reduce((s, p) => s + p.quantity, 0),
    valor_venta_mxn: pesos(ps.reduce((s, p) => s + p.price_cents * p.quantity, 0)),
    por_inventario: [...porInv.values()].sort((a, b) => b.unidades - a.unidades),
    agotados: ps
      .filter((p) => p.quantity === 0)
      .map((p) => ({ inventario: inv(p.inventory_id), sku: p.sku, nombre: p.name })),
    bajo_stock: ps
      .filter((p) => p.quantity > 0 && p.quantity <= 5)
      .map((p) => ({
        inventario: inv(p.inventory_id),
        sku: p.sku,
        nombre: p.name,
        stock: p.quantity,
      })),
  };
}

// Spanish/English filler words that should never constrain a product search.
// (Product nouns like "bateria"/"pantalla" are NOT here — they're meaningful.)
const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "para",
  "con", "por", "que", "the", "for", "and", "tienes", "tiene", "hay", "manejas",
  "maneja", "vendes", "vende",
]);
const DIACRITICS = /[̀-ͯ]/g; // combining accents
// Lowercase + strip accents, and fold the iphone/iph spelling split that exists
// across the catalog so "iphone 13" matches rows written "BAT IPH 13".
const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").replace(/iphone/g, "iph");

export async function buscarProducto(q: string) {
  // Token match across all text fields (name, sku, brand, category, color,
  // size). We require every *meaningful* token to appear, but a token that
  // matches zero products is treated as noise (slang/typo/stopword like
  // "diagnóstico" or "de") and dropped — otherwise one unknown word would
  // wipe out an otherwise-valid match. Robust to phrasing like "batería
  // diagnóstico de 13" or "pantalla iphone 15 pro max".
  const raw = strip(q.trim())
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  if (raw.length === 0) return [];

  const [names, { data }] = await Promise.all([
    inventoryNames(),
    DB.from("products").select(
      "inventory_id, sku, name, category, brand, size, color, cost_cents, price_cents, quantity, is_active",
    ),
  ]);
  const ps = (data ?? []) as ProductRow[];

  // Pre-compute an accent-stripped haystack per product, once.
  const indexed = ps.map((p) => ({
    p,
    hay: strip([p.name, p.sku, p.brand, p.category, p.color, p.size].filter(Boolean).join(" ")),
  }));

  // Keep only tokens that exist in at least one product; an unsatisfiable token
  // can only ever return zero rows, so dropping it gives the best-effort answer.
  const tokens = raw.filter((t) => indexed.some((h) => h.hay.includes(t)));
  if (tokens.length === 0) return [];

  return indexed
    .filter((h) => tokens.every((t) => h.hay.includes(t)))
    .map((h) => h.p)
    // In-stock first, then alphabetical — so the agent leads with what's sellable.
    .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0) || a.name.localeCompare(b.name))
    .slice(0, 15)
    .map((p) => ({
      inventario: names.get(p.inventory_id) ?? "—",
      sku: p.sku,
      nombre: p.name,
      categoria: p.category,
      marca: p.brand,
      color: p.color,
      talla: p.size,
      costo_mxn: pesos(p.cost_cents),
      precio_mxn: pesos(p.price_cents),
      stock: p.quantity,
      activo: p.is_active,
    }));
}

// ============================================================
// Admin-only financial reports for the MCP (date-range, MX days)
// ============================================================
type Metodo = "efectivo" | "tarjeta" | "transferencia" | "otro";
const METODOS: Metodo[] = ["efectivo", "tarjeta", "transferencia", "otro"];
const ceroMetodos = () =>
  Object.fromEntries(METODOS.map((m) => [m, 0])) as Record<Metodo, number>;
const pesosMap = (m: Record<Metodo, number>) =>
  Object.fromEntries(METODOS.map((k) => [k, pesos(m[k])])) as Record<Metodo, number>;

type VentaAgg = {
  total_cents: number;
  payment_method: Metodo | null;
  sale_items: {
    qty: number;
    unit_price_cents: number;
    products: { etiqueta: string | null; cost_cents: number } | null;
  }[];
};
type DevolAgg = {
  monto_cents: number;
  metodo: Metodo;
  devolucion_items: {
    qty: number;
    unit_price_cents: number;
    products: { cost_cents: number } | null;
  }[];
};

async function ventasEnRango(startISO: string, endISO: string): Promise<VentaAgg[]> {
  const sel =
    "total_cents, payment_method, sale_items(qty, unit_price_cents, products(etiqueta, cost_cents))";
  const [{ data: directas }, { data: cobrados }] = await Promise.all([
    DB.from("sales").select(sel).eq("status", "completed").is("settled_at", null)
      .gte("created_at", startISO).lt("created_at", endISO),
    DB.from("sales").select(sel).eq("status", "completed")
      .gte("settled_at", startISO).lt("settled_at", endISO),
  ]);
  return [
    ...((directas ?? []) as unknown as VentaAgg[]),
    ...((cobrados ?? []) as unknown as VentaAgg[]),
  ];
}

// Full cash cut for a date range [desde, hasta] (YYYY-MM-DD, MX local days).
export async function corteCaja(desde: string, hasta: string) {
  const { startISO, endISO } = rangoUTC(desde, hasta);
  const [ventas, { data: gastosData }, { data: ingresosData }, { data: devolData }] =
    await Promise.all([
      ventasEnRango(startISO, endISO),
      DB.from("gastos").select("monto_cents, metodo").gte("created_at", startISO).lt("created_at", endISO),
      DB.from("ingresos").select("monto_cents, metodo").gte("created_at", startISO).lt("created_at", endISO),
      DB.from("devoluciones")
        .select("monto_cents, metodo, devolucion_items(qty, unit_price_cents, products(cost_cents))")
        .gte("created_at", startISO).lt("created_at", endISO),
    ]);
  const gastos = (gastosData ?? []) as { monto_cents: number; metodo: Metodo }[];
  const ingresos = (ingresosData ?? []) as { monto_cents: number; metodo: Metodo }[];
  const devols = (devolData ?? []) as unknown as DevolAgg[];

  const ingresosMet = ceroMetodos();
  let ingresosTotal = 0;
  let gananciaVentas = 0;
  const etqMap: Record<string, number> = {};
  for (const v of ventas) {
    ingresosMet[v.payment_method ?? "otro"] += v.total_cents;
    ingresosTotal += v.total_cents;
    for (const it of v.sale_items ?? []) {
      gananciaVentas += (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty;
      const tag = it.products?.etiqueta;
      if (tag) etqMap[tag] = (etqMap[tag] ?? 0) + it.unit_price_cents * it.qty;
    }
  }
  for (const i of ingresos) {
    ingresosMet[i.metodo] += i.monto_cents;
    ingresosTotal += i.monto_cents;
  }
  const gastosMet = ceroMetodos();
  let gastosTotal = 0;
  for (const g of gastos) { gastosMet[g.metodo] += g.monto_cents; gastosTotal += g.monto_cents; }

  const devolMet = ceroMetodos();
  let devolTotal = 0;
  let gananciaDevuelta = 0;
  for (const d of devols) {
    devolMet[d.metodo] += d.monto_cents;
    devolTotal += d.monto_cents;
    for (const it of d.devolucion_items ?? [])
      gananciaDevuelta += (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty;
  }

  return {
    rango: desde === hasta ? desde : `${desde} a ${hasta}`,
    ventas: ventas.length,
    ingresos_mxn: pesos(ingresosTotal),
    ingresos_por_metodo: pesosMap(ingresosMet),
    gastos_mxn: pesos(gastosTotal),
    gastos_por_metodo: pesosMap(gastosMet),
    devoluciones_mxn: pesos(devolTotal),
    devoluciones_por_metodo: pesosMap(devolMet),
    balance_mxn: pesos(ingresosTotal - gastosTotal - devolTotal),
    efectivo_en_caja_mxn: pesos(ingresosMet.efectivo - gastosMet.efectivo - devolMet.efectivo),
    ganancia_neta_mxn: pesos(gananciaVentas - gananciaDevuelta),
    etiquetado: Object.entries(etqMap)
      .map(([etiqueta, monto]) => ({ etiqueta, monto_mxn: pesos(monto) }))
      .sort((a, b) => b.monto_mxn - a.monto_mxn),
  };
}

// Sales performance for a date range: totals, profit, by method, top products.
export async function reporteVentas(desde: string, hasta: string, limite = 5) {
  const { startISO, endISO } = rangoUTC(desde, hasta);
  const ventas = await ventasEnRango(startISO, endISO);

  const porMetodo = ceroMetodos();
  let ingresos = 0;
  let ganancia = 0;
  const top = new Map<string, { producto: string; vendidos: number; ingreso: number }>();
  for (const v of ventas) {
    porMetodo[v.payment_method ?? "otro"] += v.total_cents;
    ingresos += v.total_cents;
    for (const it of v.sale_items ?? []) {
      ganancia += (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty;
    }
  }
  // Top products need names — one more targeted fetch.
  const sel = "sale_items(qty, unit_price_cents, products(name, sku))";
  const [{ data: d1 }, { data: d2 }] = await Promise.all([
    DB.from("sales").select(sel).eq("status", "completed").is("settled_at", null)
      .gte("created_at", startISO).lt("created_at", endISO),
    DB.from("sales").select(sel).eq("status", "completed")
      .gte("settled_at", startISO).lt("settled_at", endISO),
  ]);
  const lineas = [...((d1 ?? []) as unknown as { sale_items: { qty: number; unit_price_cents: number; products: { name: string; sku: string } | null }[] }[]),
                  ...((d2 ?? []) as unknown as { sale_items: { qty: number; unit_price_cents: number; products: { name: string; sku: string } | null }[] }[])];
  for (const s of lineas)
    for (const it of s.sale_items ?? []) {
      const key = it.products?.sku ?? "—";
      const cur = top.get(key) ?? { producto: it.products?.name ?? "—", vendidos: 0, ingreso: 0 };
      cur.vendidos += it.qty;
      cur.ingreso += it.unit_price_cents * it.qty;
      top.set(key, cur);
    }

  return {
    rango: desde === hasta ? desde : `${desde} a ${hasta}`,
    ventas: ventas.length,
    ingresos_mxn: pesos(ingresos),
    ganancia_neta_mxn: pesos(ganancia),
    ticket_promedio_mxn: ventas.length ? pesos(ingresos / ventas.length) : 0,
    por_metodo: pesosMap(porMetodo),
    mas_vendidos: [...top.values()]
      .sort((a, b) => b.ingreso - a.ingreso)
      .slice(0, limite)
      .map((x) => ({ producto: x.producto, vendidos: x.vendidos, ingreso_mxn: pesos(x.ingreso) })),
  };
}

// Date-range variants of the summary tools (so every sales tool accepts a range).
export async function ventasResumenRango(desde: string, hasta: string) {
  const { startISO, endISO } = rangoUTC(desde, hasta);
  const ventas = await ventasEnRango(startISO, endISO);
  let ingresos = 0;
  let cogs = 0;
  for (const v of ventas) {
    ingresos += v.total_cents;
    for (const it of v.sale_items ?? []) cogs += (it.products?.cost_cents ?? 0) * it.qty;
  }
  return {
    rango: desde === hasta ? desde : `${desde} a ${hasta}`,
    ventas: ventas.length,
    ingresos_mxn: pesos(ingresos),
    ganancia_estimada_mxn: pesos(ingresos - cogs),
    ticket_promedio_mxn: ventas.length ? pesos(ingresos / ventas.length) : 0,
  };
}

export async function masVendidosRango(desde: string, hasta: string, limite = 5) {
  const { startISO, endISO } = rangoUTC(desde, hasta);
  const sel = "sale_items(qty, unit_price_cents, products(name, sku))";
  const [{ data: d1 }, { data: d2 }] = await Promise.all([
    DB.from("sales").select(sel).eq("status", "completed").is("settled_at", null)
      .gte("created_at", startISO).lt("created_at", endISO),
    DB.from("sales").select(sel).eq("status", "completed")
      .gte("settled_at", startISO).lt("settled_at", endISO),
  ]);
  const rows = [...((d1 ?? []) as unknown as SaleAgg[]), ...((d2 ?? []) as unknown as SaleAgg[])];
  const map = new Map<string, { producto: string; sku: string; vendidos: number; ingreso_mxn: number }>();
  for (const s of rows)
    for (const it of s.sale_items ?? []) {
      const sku = it.products?.sku ?? "—";
      const cur = map.get(sku) ?? { producto: it.products?.name ?? "—", sku, vendidos: 0, ingreso_mxn: 0 };
      cur.vendidos += it.qty;
      cur.ingreso_mxn += pesos(it.unit_price_cents * it.qty);
      map.set(sku, cur);
    }
  return [...map.values()]
    .sort((a, b) => b.ingreso_mxn - a.ingreso_mxn)
    .slice(0, Math.max(1, Math.min(20, Math.floor(limite))));
}
