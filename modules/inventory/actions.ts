"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { toCents } from "@/lib/money";

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
};

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
}

// Full product (incl. cost) for the edit screen — admin only, so cost never
// reaches a seller's client.
export async function getProductForEdit(id: string): Promise<EditableProduct> {
  await requireAdmin();
  const { data, error } = await insforgeAdmin.database
    .from("products")
    .select(
      "id, sku, name, brand, size, color, category, cost_cents, price_cents, quantity, is_active",
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
