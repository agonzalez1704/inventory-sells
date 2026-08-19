import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { urlBase } from "@/lib/url";

// Products are listed here so crawlers can reach them by their own path rather
// than by walking /tienda's filter combinations, which robots.ts blocks. That
// trade is the reason this file exists: without it, blocking the query strings
// would hide most of the catalogue.
//
// Built per request rather than prerendered, and the catalogue read behind it
// cached for a day. Prerendering looks better on paper — a static file — but it
// makes every deploy depend on the database answering during the build, and a
// database that has just been paused for quota is exactly when you need to be
// able to deploy. The cache means the read still happens once a day, not once
const UN_DIA = 86400;

// The protocol's ceiling is 50,000 URLs per file. Ruli is at 21k and this stays
// one file until that changes; going over silently would drop the tail.
const TOPE = 50_000;

// The InsForge client marks its requests no-store, so plain fetch caching does
// not apply and every crawler fetch would re-read every product id — exactly
// what the sitemap exists to prevent. unstable_cache caches the result
// regardless of what the underlying request asked for.
const listar = unstable_cache(
  async () => {
    // Only what a customer can act on: an inactive product 404s, and listing a
    // URL that 404s is how a sitemap loses a crawler's trust.
    const { data, error } = await insforgeAdmin.database
      .from("products")
      .select("id, updated_at")
      .eq("is_active", true)
      .limit(TOPE - 1);
    // Loud on purpose. Swallowing this publishes a sitemap saying the shop has
    // one page, which is worse than not publishing one — and it looks fine.
    if (error) throw new Error(`sitemap: ${error.message ?? "no pude leer el catálogo"}`);
    return (data ?? []) as { id: string; updated_at: string | null }[];
  },
  ["sitemap-productos"],
  { revalidate: UN_DIA },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = urlBase();
  const productos = await listar();

  return [
    { url: `${base}/tienda`, changeFrequency: "daily", priority: 1 },
    ...productos.map((p) => ({
      url: `${base}/tienda/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
