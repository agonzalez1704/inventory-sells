import { insforgeAdmin } from "@/lib/insforge/admin";
import { searchProducts } from "@/lib/search";
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

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, sku, price_cents, quantity, image_url")
    .eq("is_active", true);

  const all = (data ?? []) as Row[];

  // Facets come from the whole catalog so the chips never vanish mid-browse.
  const count = (rows: Row[], key: "brand" | "category") => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = r[key];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, n]) => ({ value, n }));
  };
  const marcas = count(all, "brand");
  const categorias = count(all, "category");

  // Quality (Original/OLED/Incell/AAA) is read from the name — the customer's
  // first question, so it's a facet like brand.
  const calCount = new Map<string, number>();
  for (const p of all) {
    const c = calidadDe(p.name);
    if (c) calCount.set(c, (calCount.get(c) ?? 0) + 1);
  }
  const calidades = [...calCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, n]) => ({ value, n }));

  // Search (brand-alias aware) → facet filters → in-stock/priced ordering.
  const matched = searchProducts(all, q);
  const filtered = matched.filter(
    (p) =>
      (!marca || p.brand === marca) &&
      (!cat || p.category === cat) &&
      (!cal || calidadDe(p.name) === cal),
  );
  const ordered = q
    ? filtered // keep relevance order when searching
    : [...filtered].sort(
        (a, b) =>
          Number(b.quantity > 0) - Number(a.quantity > 0) ||
          Number(b.price_cents > 0) - Number(a.price_cents > 0) ||
          a.name.localeCompare(b.name),
      );

  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(page, totalPages);
  const slice = ordered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

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
