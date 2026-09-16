import { facetasTienda, modelosTienda } from "@/modules/tienda/lecturas";
import { buscarModelos } from "@/modules/tienda/busqueda";
import { TiendaView } from "@/modules/tienda/TiendaView";
import type { ModeloTienda } from "@/lib/calidades";
import { filtrosSQL, leerFacetas, leerFiltros } from "@/modules/tienda/filtros";

const PER_PAGE = 24;

// Public storefront: read with the admin client (RLS is staff-only) but expose
// ONLY customer-safe fields — never cost, stock numbers, SKU or inventory.
// Filters combine (several values each); every count in the panel is computed
// over the search and the other filters, in SQL (tienda_facetas_ctx).
export default async function TiendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = ([sp.q].flat()[0] ?? "").trim();
  const filtros = leerFiltros(sp);
  const f = filtrosSQL(filtros);
  const page = Math.max(1, Number([sp.page].flat()[0] ?? 1) || 1);

  let modelos: ModeloTienda[];
  let total: number;
  let current: number;
  let facetas: unknown;
  let totalSinFiltros: number | null = null;

  if (q) {
    // Searching keeps the JS scorer: relevance ranking is shared with the rest
    // of the app and rewriting it in SQL would drift from it on the first
    // change to either. The scorer only picks and ranks the candidates; the
    // filters and the grouping run in SQL over exactly that set, so the counts
    // and the list can never disagree.
    const r = await buscarModelos(q, f, { totalSinFiltros: true });
    facetas = r.facetas;
    totalSinFiltros = r.totalSinFiltros;
    const todos = r.modelos;
    total = todos.length;
    current = Math.min(page, Math.max(1, Math.ceil(total / PER_PAGE)));
    modelos = todos.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  } else {
    // Browsing has no relevance to preserve, so the database filters, orders,
    // counts and slices, and only the 24 rows on screen travel. Counts failing
    // must not take the catalog down with them: the panel just shows no numbers.
    const [rows, fac] = await Promise.all([
      modelosTienda(f, PER_PAGE, (page - 1) * PER_PAGE),
      facetasTienda(f).catch(() => null),
    ]);
    modelos = rows;
    current = page;
    // A hand-edited ?page= past the end comes back empty, which would render as
    // "no hay productos" on a catalog that has plenty. Fall back to the first.
    if (rows.length === 0 && page > 1) {
      modelos = await modelosTienda(f, PER_PAGE, 0);
      current = 1;
    }
    facetas = fac;
    total = Number((modelos[0] as { total?: number } | undefined)?.total ?? 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <TiendaView
      modelos={modelos}
      facetas={leerFacetas(facetas)}
      filtros={filtros}
      q={q}
      page={Math.min(current, totalPages)}
      totalPages={totalPages}
      total={total}
      totalSinFiltros={totalSinFiltros}
      whatsapp={process.env.STORE_WHATSAPP ?? null}
    />
  );
}
