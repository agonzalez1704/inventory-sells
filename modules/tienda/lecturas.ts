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
 * TTL instead of once per visitor.
 *
 * 'minutes' rather than tag-only: stock moves with every POS sale, and tagging
 * every sale path would spread invalidation across half the app. A few minutes
 * of staleness on "Última pieza" is honest enough; prices and photos, which
 * customers would call lies, DO get updateTag("tienda") from the product
 * editors. The search path stays uncached — per-query keys would just fill the
 * cache with misses.
 */
export async function facetasTienda(): Promise<unknown> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tienda");
  const { data } = await insforgeAdmin.database.rpc("tienda_facetas");
  return data;
}

export async function modelosTienda(
  marca: string | null,
  cat: string | null,
  cal: string | null,
  limit: number,
  offset: number,
): Promise<(ModeloTienda & { total: number })[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tienda");
  const { data } = await insforgeAdmin.database.rpc("tienda_modelos", {
    p_marca: marca,
    p_categoria: cat,
    p_calidad: cal,
    p_limit: limit,
    p_offset: offset,
  });
  return (data ?? []) as (ModeloTienda & { total: number })[];
}
