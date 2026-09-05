"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { inventariosBloqueados } from "@/modules/sucursales/guard";
import { assertPermiso, permisosDe } from "@/lib/auth/profile";
import type { Permiso } from "@/lib/permissions";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";
import { getValorBase } from "@/modules/config/lib";
import type { ValorBase } from "@/lib/marca";

// Reading the catalog isn't one feature's privilege: the register, the quote
// builder, the purchase form and the inventory table all legitimately look
// products up. Gating on a single permiso would lock out a seller who may quote
// but not ring up sales.
const VER_CATALOGO: Permiso[] = [
  "pos_vender",
  "cotizar",
  "inventario_ver",
  "inventario_gestionar",
];

async function assertVerCatalogo(): Promise<void> {
  const perms = await permisosDe();
  if (!perms.has("admin_total") && !VER_CATALOGO.some((p) => perms.has(p))) {
    throw new Error("Sin permiso");
  }
}

/**
 * Blank the cost for anyone who may not see it.
 *
 * COLS carries cost_cents because the purchase and quote screens need it, and
 * the register calls the same function — so every seller's browser has been
 * receiving the cost of everything they search for, whether or not the screen
 * drew it. Withheld here, once, rather than at each screen: a caller that
 * forgets leaks it, and this is the only place they all pass through.
 */
async function sinCostosSiNoPuede<T extends { cost_cents: number }>(
  rows: T[],
): Promise<T[]> {
  const perms = await permisosDe();
  if (perms.has("admin_total") || perms.has("costos_ver")) return rows;
  return rows.map((r) => ({ ...r, cost_cents: 0 }));
}

/** Attach each row's inventory name (7-row lookup — cheap, cached by PG). */
async function conNombreDeInventario<T extends { inventory_id: string }>(
  rows: T[],
): Promise<(T & { inventory_name: string | null })[]> {
  if (rows.length === 0) return [];
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database.from("inventories").select("id, name");
  const nombre = new Map(((data ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]));
  return rows.map((r) => ({ ...r, inventory_name: nombre.get(r.inventory_id) ?? null }));
}

// Columns the register and the inventory table need. Deliberately not `*`:
// at 21k products the difference between this and the full row is what the
// shop's connection has to carry.
const COLS =
  "id, inventory_id, sku, name, brand, size, category, price_cents, cost_cents, quantity, etiqueta, image_url, ventas_anuales, tags_texto";

export type ProductoBuscado = {
  id: string;
  inventory_id: string;
  /** Which shelf this row lives on — the POS shows it so a seller at a branch
   *  picks the RIGHT card when the same SKU exists in several inventories. */
  inventory_name?: string | null;
  sku: string;
  name: string;
  brand: string | null;
  size: string | null;
  category: string | null;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  etiqueta: string | null;
  image_url: string | null;
  /** Units sold in the year, from the ERP import. Null when never imported. */
  ventas_anuales: number | null;
  /** Normalized compatibility-tag text; feeds the search scorer. */
  tags_texto?: string | null;
};

export type Filtro = {
  query?: string;
  inventoryId?: string | null;
  categoria?: string | null;
  limit?: number;
  /** POS only: hide stock the seller can't sell from their sucursal. */
  soloVendibles?: boolean;
};

/** How many rows the database may hand back for the scorer to rank. */
const CANDIDATOS = 1000;

/**
 * Search the catalog without shipping it to the browser.
 *
 * Two stages on purpose. The database narrows by trigram — cheap, indexed, and
 * it never has to understand what a good match is. Then lib/search.ts ranks the
 * survivors with the scoring the app already uses, so results come back in the
 * same order they always did.
 *
 * Rewriting that ranking in SQL was the alternative and would have drifted from
 * the JS on the first change to either.
 */
export async function buscarProductos(f: Filtro): Promise<ProductoBuscado[]> {
  await assertVerCatalogo();
  const insforge = await createInsForgeServerClient();
  const limite = Math.min(Math.max(f.limit ?? 60, 1), 200);
  const tokens = tokensDeConsulta(f.query ?? "");

  // No query: this is a browse, not a search. Show a page of the catalog
  // instead of all of it, in-stock first.
  if (tokens.length === 0) {
    let q = insforge.database
      .from("products")
      .select(COLS)
      .eq("is_active", true)
      .order("quantity", { ascending: false })
      .order("name", { ascending: true })
      .limit(limite);
    if (f.inventoryId) q = q.eq("inventory_id", f.inventoryId);
    if (f.categoria) q = q.eq("category", f.categoria);
    const { data } = await q;
    return conNombreDeInventario(await sinCostosSiNoPuede((data ?? []) as ProductoBuscado[]));
  }

  const { data, error } = await insforge.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokens.map(expand),
    p_inventory_id: f.inventoryId || null,
    p_categoria: f.categoria || null,
    p_limit: CANDIDATOS,
  });
  if (error) throw new Error(error.message ?? "Error al buscar");

  let candidatos = await conNombreDeInventario(
    await sinCostosSiNoPuede((data ?? []) as ProductoBuscado[]),
  );
  if (f.soloVendibles) {
    const { userId } = await auth();
    if (userId) {
      const bloqueados = await inventariosBloqueados(userId);
      if (bloqueados.size > 0)
        candidatos = candidatos.filter((c) => !bloqueados.has(c.inventory_id));
    }
  }
  return searchProducts(candidatos, f.query ?? "", {
    limit: limite,
    // Same tie-break the register used when it filtered in the browser:
    // sellable stock ahead of an empty shelf.
    tieBreak: (a, b) => Number(b.quantity > 0) - Number(a.quantity > 0),
  });
}

/**
 * Specific products by id, for a screen that already references them.
 *
 * A sale, quote or purchase holds product ids. Now that no screen receives the
 * whole catalog, those ids have nothing to resolve against unless the product
 * happens to sit in the current page — and an unresolved line doesn't render as
 * an error, it just isn't there, which then writes the record back without it.
 *
 * No is_active filter on purpose: a discontinued product still has to appear in
 * a document that already contains it.
 */
export async function productosPorId(ids: string[]): Promise<ProductoBuscado[]> {
  await assertVerCatalogo();
  const limpios = [...new Set(ids.filter(Boolean))];
  if (limpios.length === 0) return [];
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database.from("products").select(COLS).in("id", limpios);
  return conNombreDeInventario(await sinCostosSiNoPuede((data ?? []) as ProductoBuscado[]));
}

export type OrdenInventario = { key: string; dir: "asc" | "desc" } | null;

// The table's sort keys are not column names — "price" is price_cents, "ventas"
// is ventas_anuales — and passing one straight to order() sent PostgREST a
// column that does not exist. The error was swallowed and the list came back
// empty, so sorting by Precio looked like an inventory with nothing in it.
//
// Doubles as the guard that keeps an arbitrary string out of order(): this is a
// server action, so the client's own list of valid keys is not a constraint.
const COLUMNA_ORDEN: Record<string, string> = {
  sku: "sku",
  name: "name",
  category: "category",
  price: "price_cents",
  quantity: "quantity",
  ventas: "ventas_anuales",
};

export type PaginaInventario = { rows: ProductoBuscado[]; total: number };

/**
 * One page of the inventory table.
 *
 * Two paths, because they have different ceilings. Browsing with no query is
 * unbounded, so the database sorts, counts and slices. With a query, the
 * candidate set is already capped, so it's cheaper to rank and sort those in
 * memory — and that keeps the relevance ordering the scorer produces, which SQL
 * would lose.
 */
export async function paginaInventario(opts: {
  query?: string;
  inventoryId?: string | null;
  orden?: OrdenInventario;
  page?: number;
  perPage?: number;
}): Promise<PaginaInventario> {
  await assertPermiso("inventario_ver");
  const insforge = await createInsForgeServerClient();
  const perPage = Math.min(Math.max(opts.perPage ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const tokens = tokensDeConsulta(opts.query ?? "");
  const orden = opts.orden;

  if (tokens.length === 0) {
    let q = insforge.database
      .from("products")
      .select(COLS, { count: "exact" })
      .eq("is_active", true);
    if (opts.inventoryId) q = q.eq("inventory_id", opts.inventoryId);
    const col = orden ? COLUMNA_ORDEN[orden.key] : null;
    q = col
      ? q.order(col, { ascending: orden!.dir === "asc", nullsFirst: false })
      : q.order("name", { ascending: true });
    const desde = (page - 1) * perPage;
    const { data, count, error } = await q.range(desde, desde + perPage - 1);
    // Surfaced rather than swallowed: an empty table that should be full is the
    // hardest kind of failure to notice.
    if (error) throw new Error(error.message ?? "No pude leer el inventario");
    return { rows: (data ?? []) as ProductoBuscado[], total: Number(count ?? 0) };
  }

  const { data, error } = await insforge.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokens.map(expand),
    p_inventory_id: opts.inventoryId || null,
    p_categoria: null,
    p_limit: CANDIDATOS,
  });
  if (error) throw new Error(error.message ?? "Error al buscar");

  let rows = searchProducts((data ?? []) as ProductoBuscado[], opts.query ?? "");
  const colOrden = orden ? COLUMNA_ORDEN[orden.key] : null;
  if (orden && colOrden) {
    const k = colOrden as keyof ProductoBuscado;
    rows = [...rows].sort((a, b) => {
      const va = a[k], vb = b[k];
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va ?? "").localeCompare(String(vb ?? ""), "es");
      return orden.dir === "asc" ? c : -c;
    });
  }
  const desde = (page - 1) * perPage;
  return { rows: rows.slice(desde, desde + perPage), total: rows.length };
}

export type EstadisticasInv = {
  productos: number;
  piezas: number;
  /** null when the reader may not see what the stock is worth. */
  valor_cents: number | null;
  /** Which valuation valor_cents actually holds, so the label can say so. */
  valor_base: ValorBase;
  bajos: number;
  agotados: number;
};

/** Header numbers, aggregated in SQL instead of by reducing the whole catalog. */
export async function estadisticasInventario(
  inventoryId?: string | null,
): Promise<EstadisticasInv> {
  await assertPermiso("inventario_ver");
  const insforge = await createInsForgeServerClient();
  const [{ data }, base, permisos] = await Promise.all([
    insforge.database.rpc("estadisticas_inventario", {
      p_inventory_id: inventoryId || null,
    }),
    getValorBase(),
    permisosDe(),
  ]);
  const r = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  const admin = permisos.has("admin_total");
  // What the whole floor is worth is a finance number, so it answers to the
  // same permiso that already closes /caja and /reportes. Withheld here rather
  // than hidden in the component: a card the browser never receives can't be
  // read off the network tab.
  const verValor = admin || permisos.has("corte_ver");
  // Valuing that stock at COST additionally states the margin out loud, which
  // is what costos_ver guards. Falling back to the sale price rather than
  // blanking keeps the card useful, and the label travels with the value, so
  // nobody misreads which of the two they are looking at.
  const efectiva: ValorBase =
    base === "costo" && !(admin || permisos.has("costos_ver")) ? "venta" : base;
  return {
    productos: Number(r?.productos ?? 0),
    piezas: Number(r?.piezas ?? 0),
    valor_cents: verValor
      ? Number(
          (efectiva === "costo" ? r?.valor_costo_cents : r?.valor_venta_cents) ??
            0,
        )
      : null,
    valor_base: efectiva,
    bajos: Number(r?.bajos ?? 0),
    agotados: Number(r?.agotados ?? 0),
  };
}

export type CategoriaConteo = { categoria: string; productos: number };

/** Category chips, counted in SQL so the client doesn't need the catalog. */
export async function listarCategorias(
  inventoryId?: string | null,
): Promise<CategoriaConteo[]> {
  await assertVerCatalogo();
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database.rpc("categorias_de_inventario", {
    p_inventory_id: inventoryId || null,
  });
  return ((data ?? []) as { categoria: string; productos: number }[]).map((c) => ({
    categoria: c.categoria,
    productos: Number(c.productos),
  }));
}
