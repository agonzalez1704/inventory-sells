import { notFound } from "next/navigation";
import { insforgeAdmin } from "@/lib/insforge/admin";
import {
  ProductoDetalle,
  type DetalleProducto,
  type RelacionadoProducto,
} from "@/modules/tienda/ProductoDetalle";

export const dynamic = "force-dynamic";

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
};

export default async function ProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, size, color, price_cents, quantity, is_active")
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
  };

  // Related: same category (or brand), a few active products.
  const rel = insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, price_cents, quantity")
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
