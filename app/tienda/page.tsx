import { insforgeAdmin } from "@/lib/insforge/admin";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";
import { calidadDe } from "@/lib/calidad";
import { TiendaView, type PublicProduct } from "@/modules/tienda/TiendaView";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

type Row = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
};

// Public storefront: read with the admin client (RLS is staff-only) but expose
// ONLY customer-safe fields — never cost, stock numbers, SKU or inventory.
// Search/filter/paginate happen here so the brand-prefixed sku can feed the
// matcher without ever reaching the browser.
export default async function TiendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    marca?: string;
    cat?: string;
    cal?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const marca = sp.marca ?? null;
  const cat = sp.cat ?? null;
  const cal = sp.cal ?? null;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  // Facets are counted over the whole catalog so the chips never vanish
  // mid-browse — in SQL, because doing it here meant reading 21k rows out of
  // the database to show 24 of them.
  const { data: fData } = await insforgeAdmin.database.rpc("tienda_facetas");
  const facetas = (fData ?? []) as { tipo: string; valor: string; n: number }[];
  const faceta = (tipo: string) =>
    facetas
      .filter((f) => f.tipo === tipo)
      .map((f) => ({ value: f.valor, n: Number(f.n) }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
  const marcas = faceta("brand");
  const categorias = faceta("category");
  const calidades = faceta("calidad");

  let slice: Row[];
  let total: number;
  let current: number;
  let totalPages: number;

  if (q) {
    // Searching keeps the JS scorer: relevance ranking is shared with the rest
    // of the app and rewriting it in SQL would drift from it on the first
    // change to either. The candidate set the database hands over is already
    // capped, so this reads ~1k rows rather than the catalog.
    const { data } = await insforgeAdmin.database.rpc("buscar_productos_candidatos", {
      p_tokens: tokensDeConsulta(q).map(expand),
      p_inventory_id: null,
      p_categoria: cat,
      p_limit: 1000,
    });
    const filtered = searchProducts((data ?? []) as Row[], q).filter(
      (p) =>
        (!marca || p.brand === marca) &&
        (!cat || p.category === cat) &&
        (!cal || calidadDe(p.name) === cal),
    );
    total = filtered.length;
    totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    current = Math.min(page, totalPages);
    slice = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  } else {
    // Browsing has no relevance to preserve, so the database filters, orders,
    // counts and slices, and only the 24 rows on screen travel.
    const pagina = async (p: number) => {
      const { data } = await insforgeAdmin.database.rpc("tienda_lista", {
        p_marca: marca,
        p_categoria: cat,
        p_calidad: cal,
        p_limit: PER_PAGE,
        p_offset: (p - 1) * PER_PAGE,
      });
      return (data ?? []) as (Row & { total: number })[];
    };

    let rows = await pagina(page);
    current = page;
    // A hand-edited ?page= past the end comes back empty, which would render as
    // "no hay productos" on a catalog that has plenty. Fall back to the first.
    if (rows.length === 0 && page > 1) {
      rows = await pagina(1);
      current = 1;
    }
    total = Number(rows[0]?.total ?? 0);
    totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    current = Math.min(current, totalPages);
    slice = rows;
  }

  const productos: PublicProduct[] = slice.map((p) => ({
    id: p.id,
    nombre: p.name,
    marca: p.brand,
    categoria: p.category,
    precio_cents: p.price_cents,
    disponible: p.quantity > 0,
    imagen: p.image_url,
  }));

  return (
    <TiendaView
      productos={productos}
      marcas={marcas}
      categorias={categorias}
      calidades={calidades}
      q={q}
      marca={marca}
      cat={cat}
      cal={cal}
      page={current}
      totalPages={totalPages}
      total={total}
      whatsapp={process.env.STORE_WHATSAPP ?? null}
    />
  );
}
