import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

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
};

export async function fiadosPendientes() {
  const { data } = await DB.from("sales")
    .select("total_cents, note, created_at, sale_items(qty, products(name))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const loans = (data ?? []) as unknown as LoanAgg[];

  const fiados = loans.map((l) => ({
    cliente: l.note ?? "sin nota",
    total_mxn: pesos(l.total_cents),
    dias: Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86_400_000),
    productos: (l.sale_items ?? [])
      .map((it) => `${it.products?.name ?? "?"}${it.qty > 1 ? ` x${it.qty}` : ""}`)
      .join(", "),
  }));

  return {
    total_mxn: fiados.reduce((s, f) => s + f.total_mxn, 0),
    pendientes: fiados.length,
    fiados,
  };
}

type ProductRow = {
  inventory_id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
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

export async function buscarProducto(q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const [names, { data }] = await Promise.all([
    inventoryNames(),
    DB.from("products").select(
      "inventory_id, sku, name, category, brand, size, cost_cents, price_cents, quantity, is_active",
    ),
  ]);
  const ps = (data ?? []) as ProductRow[];

  return ps
    .filter(
      (p) =>
        p.sku.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle),
    )
    .slice(0, 15)
    .map((p) => ({
      inventario: names.get(p.inventory_id) ?? "—",
      sku: p.sku,
      nombre: p.name,
      categoria: p.category,
      marca: p.brand,
      talla: p.size,
      costo_mxn: pesos(p.cost_cents),
      precio_mxn: pesos(p.price_cents),
      stock: p.quantity,
      activo: p.is_active,
    }));
}
