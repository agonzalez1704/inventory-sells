import type { Metadata } from "next";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { TiendaView, type PublicProduct } from "@/modules/tienda/TiendaView";

export const metadata: Metadata = {
  title: "Catálogo — Fiable",
  description: "Pantallas, baterías y refacciones para celular.",
};

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price_cents: number;
  quantity: number;
};

// Public storefront: read with the admin client (RLS is staff-only) but expose
// ONLY customer-safe fields — never cost, stock numbers, SKU or inventory.
export default async function TiendaPage() {
  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, price_cents, quantity")
    .eq("is_active", true);

  const productos: PublicProduct[] = ((data ?? []) as Row[])
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      marca: p.brand,
      categoria: p.category,
      precio_cents: p.price_cents,
      disponible: p.quantity > 0,
    }))
    // Available + priced first, then the rest, alphabetical.
    .sort(
      (a, b) =>
        Number(b.disponible) - Number(a.disponible) ||
        Number(b.precio_cents > 0) - Number(a.precio_cents > 0) ||
        a.nombre.localeCompare(b.nombre),
    );

  return <TiendaView productos={productos} />;
}
