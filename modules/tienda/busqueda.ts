import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";
import type { ModeloTienda } from "@/lib/calidades";

type Row = {
  id: string;
  name: string;
  modelo: string | null;
  calidad: string | null;
  brand: string | null;
  category: string | null;
  sku: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
};

/**
 * A storefront search: every matching model, most relevant first, plus the
 * filter counts over exactly that set. Shared by the results page and the
 * suggestions under the search box, so "Ver los 3 modelos" leads to three.
 *
 * Searching keeps the JS scorer — relevance ranking is shared with the rest of
 * the app, and rewriting it in SQL would drift from it on the first change to
 * either. The scorer only picks and ranks the candidates; filters and grouping
 * run in SQL over exactly those ids, so counts and list cannot disagree.
 */
export async function buscarModelos(
  q: string,
  f: Record<string, unknown>,
): Promise<{ modelos: ModeloTienda[]; facetas: unknown }> {
  const cand = await insforgeAdmin.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokensDeConsulta(q).map(expand),
    p_inventory_id: null,
    p_categoria: null,
    p_limit: 1000,
  });
  if (cand.error) throw new Error(`buscar_productos_candidatos: ${cand.error.message}`);
  // Never null here: null means "the whole catalog" to the SQL side. A search
  // with no match passes [] and gets nothing, as it should.
  const ranking = searchProducts((cand.data ?? []) as Row[], q).map((p) => p.id);
  const rango = new Map(ranking.map((id, i) => [id, i]));

  const [cat, fac] = await Promise.all([
    insforgeAdmin.database.rpc("tienda_catalogo", { p_f: f, p_ids: ranking, p_limit: 1000, p_offset: 0 }),
    insforgeAdmin.database.rpc("tienda_facetas_ctx", { p_f: f, p_ids: ranking }),
  ]);
  if (cat.error) throw new Error(`tienda_catalogo: ${cat.error.message}`);

  // A model is as relevant as its best-matching variant.
  const mejor = (m: ModeloTienda) => Math.min(...m.variantes.map((v) => rango.get(v.id) ?? Infinity));
  const modelos = ((cat.data ?? []) as ModeloTienda[]).sort((a, b) => mejor(a) - mejor(b));
  return { modelos, facetas: fac.data };
}
