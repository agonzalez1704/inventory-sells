import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { ModeloTienda } from "@/lib/calidades";

/**
 * The storefront's hot reads, cached (nextjs-app-like.md step 2).
 *
 * Browsing and the facet rail repeat identically for every anonymous visitor,
 * and this is the same public surface that once burned 6 GB of egress — the
 * arguments are the cache key, so each filter combination is fetched once per
 * TTL instead of once per visitor. `f` comes from filtrosSQL, whose sorted
 * lists and fixed key order keep equal filters on one cache entry.
 *
 * 'minutes' rather than tag-only: stock moves with every POS sale, and tagging
 * every sale path would spread invalidation across half the app. A few minutes
 * of staleness on "Última pieza" is honest enough; prices and photos, which
 * customers would call lies, DO get updateTag("tienda") from the product
 * editors. The search path stays uncached — per-query keys would just fill the
 * cache with misses.
 *
 * Errors throw instead of returning empty: an empty result would be cached for
 * minutes and the shop would look sold out. Thrown, nothing is cached and the
 * page decides (counts degrade, the listing goes to app/tienda/error.tsx).
 */
export async function facetasTienda(f: Record<string, unknown>): Promise<unknown> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tienda");
  const { data, error } = await insforgeAdmin.database.rpc("tienda_facetas_ctx", {
    p_f: f,
    p_ids: null,
  });
  if (error) throw new Error(`tienda_facetas_ctx: ${error.message}`);
  return data;
}

export async function modelosTienda(
  f: Record<string, unknown>,
  limit: number,
  offset: number,
): Promise<(ModeloTienda & { total: number })[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tienda");
  const { data, error } = await insforgeAdmin.database.rpc("tienda_catalogo", {
    p_f: f,
    p_ids: null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`tienda_catalogo: ${error.message}`);
  return (data ?? []) as (ModeloTienda & { total: number })[];
}

/** Inventories the store sells from (not a supplier's solo-consulta). */
async function almacenesDeVenta(): Promise<[string, string][]> {
  "use cache";
  cacheLife("hours");
  cacheTag("tienda");
  const { data, error } = await insforgeAdmin.database.from("inventories").select("id, name").eq("solo_consulta", false);
  if (error) throw new Error(`inventories: ${error.message}`);
  return ((data ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]);
}

/**
 * Name each variant's inventory (Mostrador, CEDIS) for the listing — only when
 * the shop sells from more than one, otherwise it's the same word on every
 * card. Takes the rows on screen, not the catalog: one small query.
 */
export async function nombrarAlmacenes(modelos: ModeloTienda[]): Promise<void> {
  const almacenes = new Map(await almacenesDeVenta());
  if (almacenes.size < 2) return;
  const ids = modelos.flatMap((m) => m.variantes.map((v) => v.id));
  if (!ids.length) return;
  const inv = new Map(await inventarioDe(ids));
  for (const m of modelos) for (const v of m.variantes) v.almacen = almacenes.get(inv.get(v.id) ?? "") ?? null;
}

// Cached like the listing it decorates: same rows, same TTL, and no uncached
// fetch inside the prerender.
async function inventarioDe(ids: string[]): Promise<[string, string][]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tienda");
  const { data, error } = await insforgeAdmin.database.from("products").select("id, inventory_id").in("id", ids);
  if (error) throw new Error(`products: ${error.message}`);
  return ((data ?? []) as { id: string; inventory_id: string }[]).map((p) => [p.id, p.inventory_id]);
}
