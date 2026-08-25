"use server";

import { auth } from "@clerk/nextjs/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { normalize } from "@/lib/search";
import { updateTag } from "next/cache";

// Compatibility tags: free-form labels shared between products. Two products
// with a tag in common are compatible — the data-side version of what the
// phone catalog gets for free from model names.

export type Tag = { id: string; nombre: string };

export type ProductoCompatible = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  tags_compartidos: number;
};

export async function tagsDeProducto(productId: string): Promise<Tag[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database
    .from("product_tags")
    .select("tags(id, nombre)")
    .eq("product_id", productId);
  return ((data ?? []) as unknown as { tags: Tag | null }[])
    .map((r) => r.tags)
    .filter((t): t is Tag => !!t)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Autocomplete: existing tags matching the fragment, so names converge. */
export async function sugerirTags(q: string): Promise<Tag[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const frag = normalize(q);
  if (!frag) return [];
  const { data } = await insforgeAdmin.database
    .from("tags")
    .select("id, nombre")
    .like("nombre_norm", `%${frag}%`)
    .order("nombre")
    .limit(8);
  return (data ?? []) as Tag[];
}

/**
 * Attach a tag by NAME — finds the existing tag (normalized) or creates it.
 * Tagging is catalog work, so it answers to inventario_gestionar.
 */
export async function etiquetarProducto(
  productId: string,
  nombre: string,
): Promise<Tag> {
  await assertPermiso("inventario_gestionar");
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const norm = normalize(limpio);
  if (norm.length < 2 || limpio.length > 60)
    throw new Error("Etiqueta inválida (2–60 caracteres)");

  const { data: existing } = await insforgeAdmin.database
    .from("tags")
    .select("id, nombre")
    .eq("nombre_norm", norm)
    .maybeSingle();
  let tag = existing as Tag | null;
  if (!tag) {
    const { data, error } = await insforgeAdmin.database
      .from("tags")
      .insert([{ nombre: limpio, nombre_norm: norm }])
      .select("id, nombre")
      .single();
    // A parallel save can win the race; the unique index makes that harmless —
    // re-read instead of failing the tagging.
    if (error) {
      const { data: again } = await insforgeAdmin.database
        .from("tags")
        .select("id, nombre")
        .eq("nombre_norm", norm)
        .maybeSingle();
      tag = again as Tag | null;
      if (!tag) throw new Error(error.message ?? "No se pudo crear la etiqueta");
    } else {
      tag = data as Tag;
    }
  }

  const { error: linkErr } = await insforgeAdmin.database
    .from("product_tags")
    .insert([{ product_id: productId, tag_id: tag.id }]);
  // Already linked is a no-op, not an error.
  if (linkErr && !/duplicate|unique/i.test(linkErr.message ?? ""))
    throw new Error(linkErr.message ?? "No se pudo etiquetar");

  updateTag("tienda");
  return tag;
}

export async function desetiquetarProducto(
  productId: string,
  tagId: string,
): Promise<void> {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("product_tags")
    .delete()
    .eq("product_id", productId)
    .eq("tag_id", tagId);
  if (error) throw new Error(error.message ?? "No se pudo quitar la etiqueta");
  updateTag("tienda");
}

/** Products sharing at least one tag with this one, best-connected first. */
export async function compatiblesDe(
  productId: string,
  limit = 12,
): Promise<ProductoCompatible[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data, error } = await insforgeAdmin.database.rpc("productos_compatibles", {
    p_product_id: productId,
    p_limit: limit,
  });
  if (error) return [];
  return ((data ?? []) as ProductoCompatible[]).map((p) => ({
    ...p,
    tags_compartidos: Number(p.tags_compartidos),
  }));
}
