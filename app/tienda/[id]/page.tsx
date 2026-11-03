import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA } from "@/lib/marca";
import { inventariosSoloConsulta } from "@/modules/inventory/solo-consulta";
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
    .select("name, descripcion, brand, category, is_active")
    .eq("id", id)
    .maybeSingle();
  const p = data as Pick<Row, "name" | "descripcion" | "brand" | "category" | "is_active"> | null;
  if (!p || !p.is_active) return { robots: { index: false, follow: false } };

  const titulo = [p.name, p.brand].filter(Boolean).join(" · ");
  // The shop's name comes from the layout's title template, not from MARCA —
  // that one is the internal app name and the customer has never heard it.
  return {
    title: titulo,
    description:
      p.descripcion?.slice(0, 160) ||
      [p.name, p.brand, p.category, "Consulta disponibilidad y precio."].filter(Boolean).join(" · "),
    openGraph: { title: titulo, type: "website" },
  };
}

type Row = {
  id: string;
  name: string;
  descripcion: string | null;
  modelo: string;
  brand: string | null;
  category: string | null;
  price_cents: number;
  quantity: number;
  is_active: boolean;
  image_url: string | null;
  sku: string | null;
  conversion_grupo: string | null;
  numeros_originales: string[] | null;
};

type Mini = {
  id: string;
  name: string;
  brand: string | null;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  inventory_id?: string;
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
    .select("id, name, descripcion, modelo, brand, category, price_cents, quantity, is_active, image_url, sku, conversion_grupo, numeros_originales")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`producto: ${error.message}`);
  const row = data as Row | null;
  if (!row || !row.is_active) notFound();

  // Same key the catalog groups by: the part number in the auto parts shop
  // (tienda_una_pieza_por_sku), brand, type and model in the phone shop.
  let hermanos = insforgeAdmin.database.from("products").select("id").eq("is_active", true).limit(20);
  if (MARCA.id === "ruli" && row.sku) hermanos = hermanos.eq("sku", row.sku);
  else {
    hermanos = hermanos.eq("modelo", row.modelo);
    hermanos = row.brand ? hermanos.eq("brand", row.brand) : hermanos.is("brand", null);
    hermanos = row.category ? hermanos.eq("category", row.category) : hermanos.is("category", null);
  }

  const rel = insforgeAdmin.database
    .from("products")
    .select("id, name, brand, price_cents, quantity, image_url, inventory_id")
    .eq("is_active", true)
    .neq("modelo", row.modelo)
    .limit(12);

  // Equivalent parts the shop carries (the owner links them in /catalogo).
  const conv = row.conversion_grupo
    ? insforgeAdmin.database
        .from("products")
        .select("id, name, brand, price_cents, quantity, image_url, sku, inventory_id")
        .eq("is_active", true)
        .eq("conversion_grupo", row.conversion_grupo)
        .neq("id", row.id)
        .order("quantity", { ascending: false })
        .limit(40)
    : Promise.resolve({ data: [] });

  const [herm, compat, relData, convData, carrosData] = await Promise.all([
    hermanos,
    insforgeAdmin.database.rpc("productos_compatibles", { p_product_id: row.id, p_limit: 12 }),
    row.category
      ? rel.eq("category", row.category)
      : row.brand
        ? rel.eq("brand", row.brand)
        : Promise.resolve({ data: [] }),
    conv,
    insforgeAdmin.database
      .from("product_tags")
      .select("cilindrada, tags(veh_marca, veh_modelo, veh_version, veh_anio_desde, veh_anio_hasta)")
      .eq("product_id", row.id),
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

  // A supplier's solo-consulta row (Grob) has no page of its own: never link one.
  const consulta = await inventariosSoloConsulta();
  const compatIds = ((compat.data ?? []) as Mini[]).map((c) => c.id);
  const deConsulta = new Set<string>();
  if (consulta.size && compatIds.length) {
    const { data } = await insforgeAdmin.database.from("products").select("id, inventory_id").in("id", compatIds);
    for (const p of (data ?? []) as { id: string; inventory_id: string }[])
      if (consulta.has(p.inventory_id)) deConsulta.add(p.id);
  }
  const visible = (p: { id: string; inventory_id?: string }) =>
    !deConsulta.has(p.id) && !consulta.has(p.inventory_id ?? "");

  const propios = new Set(ids);
  const compatibles = ((compat.data ?? []) as Mini[])
    .filter((c) => !propios.has(c.id) && visible(c))
    .slice(0, 8)
    .map(aRelacionado);
  // One row per part number: the same part lives once per inventario.
  const vistos = new Set([row.sku]);
  const conversiones = ((convData.data ?? []) as (Mini & { sku: string | null })[])
    .filter((c) => c.sku && visible(c) && !propios.has(c.id) && !vistos.has(c.sku) && vistos.add(c.sku))
    .map((c) => ({ ...aRelacionado(c), sku: c.sku as string }));
  // Other brands' numbers it doesn't carry: shown so a customer holding one
  // finds the part.
  const otrasMarcas = (row.numeros_originales ?? []).filter((n) => !vistos.has(n));
  // Which cars it fits, spelled out: the description says only the part
  // ("Amortiguador del. der."), so a customer who arrived by part number
  // learns the cars here.
  type Carro = { cilindrada: string | null; tags: {
    veh_marca: string | null; veh_modelo: string | null; veh_version: string | null;
    veh_anio_desde: number | null; veh_anio_hasta: number | null } | null };
  const carros = [...new Set(
    ((carrosData.data ?? []) as unknown as Carro[])
      .filter((c) => c.tags?.veh_marca)
      .sort((a, b) =>
        `${a.tags!.veh_marca} ${a.tags!.veh_modelo}`.localeCompare(`${b.tags!.veh_marca} ${b.tags!.veh_modelo}`)
        || (a.tags!.veh_anio_desde ?? 0) - (b.tags!.veh_anio_desde ?? 0))
      .map(({ cilindrada, tags: t }) => {
        const anios = t!.veh_anio_desde == null ? ""
          : t!.veh_anio_desde === t!.veh_anio_hasta ? `${t!.veh_anio_desde}`
          : `${t!.veh_anio_desde}–${t!.veh_anio_hasta}`;
        return [t!.veh_marca, t!.veh_modelo, t!.veh_version, anios, cilindrada].filter(Boolean).join(" ");
      }),
  )];
  const relacionados = ((relData.data ?? []) as Mini[])
    .filter(visible)
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
      conversiones={conversiones}
      carros={carros}
      otrasMarcas={otrasMarcas}
      descripcion={row.descripcion}
      whatsapp={process.env.STORE_WHATSAPP ?? null}
    />
  );
}
