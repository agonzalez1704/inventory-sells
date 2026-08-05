"use server";

import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso, permisosDe } from "@/lib/auth/profile";
import type { Permiso } from "@/lib/permissions";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";

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

// Columns the register and the inventory table need. Deliberately not `*`:
// at 21k products the difference between this and the full row is what the
// shop's connection has to carry.
const COLS =
  "id, inventory_id, sku, name, brand, size, category, price_cents, cost_cents, quantity, etiqueta, image_url";

export type ProductoBuscado = {
  id: string;
  inventory_id: string;
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
};

export type Filtro = {
  query?: string;
  inventoryId?: string | null;
  categoria?: string | null;
  limit?: number;
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
    return (data ?? []) as ProductoBuscado[];
  }

  const { data, error } = await insforge.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokens.map(expand),
    p_inventory_id: f.inventoryId || null,
    p_categoria: f.categoria || null,
    p_limit: CANDIDATOS,
  });
  if (error) throw new Error(error.message ?? "Error al buscar");

  const candidatos = (data ?? []) as ProductoBuscado[];
  return searchProducts(candidatos, f.query ?? "", {
    limit: limite,
    // Same tie-break the register used when it filtered in the browser:
    // sellable stock ahead of an empty shelf.
    tieBreak: (a, b) => Number(b.quantity > 0) - Number(a.quantity > 0),
  });
}

export type OrdenInventario = { key: string; dir: "asc" | "desc" } | null;

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
    q = orden
      ? q.order(orden.key, { ascending: orden.dir === "asc" })
      : q.order("name", { ascending: true });
    const desde = (page - 1) * perPage;
    const { data, count } = await q.range(desde, desde + perPage - 1);
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
  if (orden) {
    const k = orden.key as keyof ProductoBuscado;
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
  valor_cents: number;
  bajos: number;
  agotados: number;
};

/** Header numbers, aggregated in SQL instead of by reducing the whole catalog. */
export async function estadisticasInventario(
  inventoryId?: string | null,
): Promise<EstadisticasInv> {
  await assertPermiso("inventario_ver");
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database.rpc("estadisticas_inventario", {
    p_inventory_id: inventoryId || null,
  });
  const r = (Array.isArray(data) ? data[0] : data) as Partial<EstadisticasInv> | undefined;
  return {
    productos: Number(r?.productos ?? 0),
    piezas: Number(r?.piezas ?? 0),
    valor_cents: Number(r?.valor_cents ?? 0),
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
