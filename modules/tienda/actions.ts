"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { modelosCompatibles, type Compat } from "@/lib/compat";
import { searchProducts } from "@/lib/search";
import type { PublicProduct } from "./TiendaView";

export type CompatResult = Compat & { productos: PublicProduct[] };

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

// Public (storefront) — a zero-result search asks the AI which models share the
// same part, then looks those up in the catalog. Returns customer-safe fields
// only: never cost, stock counts, SKU or inventory.
export async function buscarCompatibles(query: string): Promise<CompatResult> {
  const q = query.trim();
  if (!q) return { modelos: [], nota: null, fallo: false, productos: [] };

  const compat = await modelosCompatibles(q);
  // Pass the failure through untouched: the box must be able to say "couldn't
  // check" instead of "no compatible models", which is a different claim.
  if (compat.fallo || compat.modelos.length === 0) return { ...compat, productos: [] };
  const { modelos, nota } = compat;

  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, name, brand, category, sku, price_cents, quantity, image_url")
    .eq("is_active", true);
  const all = (data ?? []) as Row[];

  // Look each suggested model up in the catalog; keep the best hits, no dupes.
  const seen = new Set<string>();
  const productos: PublicProduct[] = [];
  for (const modelo of modelos) {
    for (const p of searchProducts(all, modelo, { limit: 4 })) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      productos.push({
        id: p.id,
        nombre: p.name,
        marca: p.brand,
        categoria: p.category,
        precio_cents: p.price_cents,
        disponible: p.quantity > 0,
        imagen: p.image_url,
      });
    }
  }
  productos.sort((a, b) => Number(b.disponible) - Number(a.disponible));

  return { modelos, nota, fallo: false, productos };
}
