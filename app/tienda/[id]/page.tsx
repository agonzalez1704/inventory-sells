import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";

import {
  ProductoDetalle,
  type DetalleProducto,
  type RelacionadoProducto,
} from "@/modules/tienda/ProductoDetalle";

export const dynamic = "force-dynamic";

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
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  price_cents: number;
  quantity: number;
  is_active: boolean;
  image_url: string | null;
};

export default async function ProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, size, color, price_cents, quantity, is_active, image_url")
    .eq("id", id)
    .maybeSingle();

  const row = data as Row | null;
  if (!row || !row.is_active) notFound();

  const producto: DetalleProducto = {
    id: row.id,
    nombre: row.name,
    marca: row.brand,
    categoria: row.category,
    talla: row.size,
    color: row.color,
    precio_cents: row.price_cents,
    disponible: row.quantity > 0,
    imagen: row.image_url,
  };

  // Related: same category (or brand), a few active products.
  const rel = insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, price_cents, quantity, image_url")
    .eq("is_active", true)
    .neq("id", row.id)
    .limit(8);
  const { data: relData } = row.category
    ? await rel.eq("category", row.category)
    : row.brand
      ? await rel.eq("brand", row.brand)
      : await rel.limit(0);

  const relacionados: RelacionadoProducto[] = ((relData ?? []) as Row[])
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      marca: p.brand,
      precio_cents: p.price_cents,
      disponible: p.quantity > 0,
      imagen: p.image_url,
    }))
    .sort((a, b) => Number(b.disponible) - Number(a.disponible))
    .slice(0, 4);

  const whatsapp = process.env.STORE_WHATSAPP ?? null;

  return (
    <ProductoDetalle
      producto={producto}
      relacionados={relacionados}
      whatsapp={whatsapp}
    />
  );
}
