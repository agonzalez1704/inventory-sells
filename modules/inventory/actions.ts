"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { toCents } from "@/lib/money";
import { esEtiquetaValida } from "@/lib/etiquetas";
import { attempt, type ActionResult } from "@/lib/errors";

export type EditableProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  size: string | null;
  color: string | null;
  category: string | null;
  cost_cents: number;
  price_cents: number;
  quantity: number;
  is_active: boolean;
  etiqueta: string | null;
};

export type ProductPatch = {
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  cost: number; // pesos
  price: number; // pesos
  is_active: boolean;
  etiqueta: string | null;
};

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
}

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Product photo for the storefront. Any signed-in staff member can add one —
// it carries no cost/stock data, unlike the (admin-only) edit form.
export async function subirImagenProducto(
  productId: string,
  form: FormData,
): Promise<ActionResult<{ url: string }>> {
  return attempt("subirImagenProducto", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Falta la imagen");
    if (file.size === 0) throw new Error("Imagen vacía");
    if (file.size > MAX_BYTES) throw new Error("La imagen pesa más de 5 MB");

    const ext = MIME_EXT[file.type];
    if (!ext) throw new Error("Formato no válido (usa JPG, PNG o WebP)");

    const key = `products/${productId}.${ext}`;
    // Replacing: drop the old object first (upload doesn't overwrite). Also
    // clear a prior key with a different extension, or it lingers orphaned.
    const { data: prev } = await insforgeAdmin.database
      .from("products")
      .select("image_key")
      .eq("id", productId)
      .maybeSingle();
    const prevKey = (prev as { image_key?: string | null } | null)?.image_key;
    for (const k of new Set([key, prevKey].filter(Boolean) as string[])) {
      await insforgeAdmin.storage
        .from(BUCKET)
        .remove(k)
        .catch(() => {});
    }

    const { data, error } = await insforgeAdmin.storage
      .from(BUCKET)
      .upload(key, file);
    if (error || !data) throw new Error(error?.message ?? "No se pudo subir");

    // Via RPC: `authenticated` has no UPDATE grant on the image columns, and the
    // only UPDATE policy on products is admin-only.
    const insforge = await createInsForgeServerClient();
    const { error: upErr } = await insforge.database.rpc("set_product_image", {
      p_product_id: productId,
      p_url: data.url,
      p_key: data.key,
    });
    if (upErr) throw new Error(upErr.message ?? "No se pudo guardar la imagen");

    return { url: data.url };
  });
}

export async function quitarImagenProducto(
  productId: string,
): Promise<ActionResult<null>> {
  return attempt("quitarImagenProducto", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const { data } = await insforgeAdmin.database
      .from("products")
      .select("image_key")
      .eq("id", productId)
      .maybeSingle();
    const key = (data as { image_key?: string | null } | null)?.image_key;

    if (key) {
      // Best-effort: a stale object is harmless, a stale row reference is not.
      await insforgeAdmin.storage
        .from(BUCKET)
        .remove(key)
        .catch(() => {});
    }

    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.rpc("set_product_image", {
      p_product_id: productId,
      p_url: null,
      p_key: null,
    });
    if (error) throw new Error(error.message ?? "No se pudo quitar la imagen");
    return null;
  });
}

// Full product (incl. cost) for the edit screen — admin only, so cost never
// reaches a seller's client.
export async function getProductForEdit(id: string): Promise<EditableProduct> {
  await requireAdmin();
  const { data, error } = await insforgeAdmin.database
    .from("products")
    .select(
      "id, sku, name, brand, size, color, category, cost_cents, price_cents, quantity, is_active, etiqueta",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Producto no encontrado");
  return data as EditableProduct;
}

export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<void> {
  await requireAdmin();
  const etiqueta = patch.etiqueta?.trim() || null;
  if (etiqueta !== null && !esEtiquetaValida(etiqueta)) {
    throw new Error("Etiqueta no válida");
  }
  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("products")
    .update({
      name: patch.name.trim(),
      category: patch.category?.trim() || null,
      brand: patch.brand?.trim() || null,
      size: patch.size?.trim() || null,
      color: patch.color?.trim() || null,
      cost_cents: Math.max(0, toCents(patch.cost || 0)),
      price_cents: Math.max(0, toCents(patch.price || 0)),
      is_active: patch.is_active,
      etiqueta,
    })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "Error al guardar");
}

// Manual stock correction (recount / damage / return) → adjust_stock RPC.
// Returns the new quantity.
export async function adjustStock(
  productId: string,
  delta: number,
  reason: "adjustment" | "return",
  note: string | null,
): Promise<number> {
  if (!Number.isInteger(delta) || delta === 0)
    throw new Error("Ajuste inválido");
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("adjust_stock", {
    p_product_id: productId,
    p_delta: delta,
    p_reason: reason,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "Error al ajustar stock");
  return Number(data);
}
