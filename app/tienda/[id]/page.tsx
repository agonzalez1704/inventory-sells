import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { ModeloTienda } from "@/lib/calidades";
import { ProductoDetalle, type RelacionadoProducto } from "@/modules/tienda/ProductoDetalle";

// Without this every product page carries the root title, which is indexed but
// unfindable — nobody searches for the shop by name to reach one part.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data } = await insforgeAdmin.database
    .from("products")
    .select("name, brand, category, is_active")
    .eq("id", id)
    .maybeSingle();
  const p = data as Pick<Row, "name" | "brand" | "category" | "is_active"> | null;
  if (!p || !p.is_active) return { robots: { index: false, follow: false } };

  const titulo = [p.name, p.brand].filter(Boolean).join(" · ");
  // The shop's name comes from the layout's title template, not from MARCA —
  // that one is the internal app name and the customer has never heard it.
  return {
    title: titulo,
    description: [p.name, p.brand, p.category, "Consulta disponibilidad y precio."]
      .filter(Boolean)
      .join(" · "),
    openGraph: { title: titulo, type: "website" },
  };
}

type Row = {
  id: string;
  name: string;
  modelo: string;
  brand: string | null;
  category: string | null;
  price_cents: number;
  quantity: number;
  is_active: boolean;
  image_url: string | null;
};

type Mini = {
  id: string;
  name: string;
  brand: string | null;
  price_cents: number;
  quantity: number;
  image_url: string | null;
};

const aRelacionado = (p: Mini): RelacionadoProducto => ({
  id: p.id,
  nombre: p.name,
  marca: p.brand,
  precio_cents: p.price_cents,
  disponible: p.quantity > 0,
  imagen: p.image_url,
});

/**
 * The model page. The URL names one variant (the one the catalog row or a
 * shared link pointed at), but the page sells the model: every quality of it,
 * chosen here. The variants come from tienda_catalogo over the siblings' ids —
 * the same function the catalog lists with — so badges, availability and the
 * best-seller can never disagree between the row and the page.
 */
export default async function ProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A malformed id makes the uuid comparison fail in the database: that is a
  // missing page, not a server error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data, error } = await insforgeAdmin.database
    .from("products")
    .select("id, name, modelo, brand, category, price_cents, quantity, is_active, image_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`producto: ${error.message}`);
  const row = data as Row | null;
  if (!row || !row.is_active) notFound();

  // Same key the catalog groups by: brand, type and model.
  let hermanos = insforgeAdmin.database
    .from("products")
    .select("id")
    .eq("is_active", true)
    .eq("modelo", row.modelo)
    .limit(20);
  hermanos = row.brand ? hermanos.eq("brand", row.brand) : hermanos.is("brand", null);
  hermanos = row.category ? hermanos.eq("category", row.category) : hermanos.is("category", null);

  const rel = insforgeAdmin.database
    .from("products")
    .select("id, name, brand, price_cents, quantity, image_url")
    .eq("is_active", true)
    .neq("modelo", row.modelo)
    .limit(12);

  const [herm, compat, relData] = await Promise.all([
    hermanos,
    insforgeAdmin.database.rpc("productos_compatibles", { p_product_id: row.id, p_limit: 12 }),
    row.category
      ? rel.eq("category", row.category)
      : row.brand
        ? rel.eq("brand", row.brand)
        : Promise.resolve({ data: [] }),
  ]);

  const ids = [...new Set([row.id, ...((herm.data ?? []) as { id: string }[]).map((h) => h.id)])];

  const [cat, gal] = await Promise.all([
    insforgeAdmin.database.rpc("tienda_catalogo", { p_f: {}, p_ids: ids, p_limit: 5, p_offset: 0 }),
    insforgeAdmin.database
      .from("product_images")
      .select("product_id, url, orden")
      .in("product_id", ids)
      .order("orden", { ascending: true }),
  ]);
  if (cat.error) throw new Error(`tienda_catalogo: ${cat.error.message}`);

  const modelo = ((cat.data ?? []) as ModeloTienda[]).find((m) =>
    m.variantes.some((v) => v.id === row.id),
  );
  if (!modelo) notFound();

  const vistas: Record<string, string[]> = {};
  for (const g of (gal.data ?? []) as { product_id: string; url: string }[]) {
    (vistas[g.product_id] ??= []).push(g.url);
  }

  const propios = new Set(ids);
  const compatibles = ((compat.data ?? []) as Mini[])
    .filter((c) => !propios.has(c.id))
    .slice(0, 8)
    .map(aRelacionado);
  const relacionados = ((relData.data ?? []) as Mini[])
    .map(aRelacionado)
    .sort((a, b) => Number(b.disponible) - Number(a.disponible))
    .slice(0, 4);

  return (
    <ProductoDetalle
      modelo={modelo}
      inicial={row.id}
      vistas={vistas}
      relacionados={relacionados}
      compatibles={compatibles}
      whatsapp={process.env.STORE_WHATSAPP ?? null}
    />
  );
}
